<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  DETAILS,
  estimateCredits,
  FRAME_RATIOS,
  getModel,
  ratioValue,
  TOOL_META,
  usesApi,
  normalizeResolution,
} from '../lib/catalog'
import {
  composeImage,
  cropImage,
  cutoutImage,
  loadImage,
  maskIsEmpty,
  resizeImage,
  sliceGrid,
} from '../lib/render'
import { useChat } from '../lib/store'
import type { AspectRatio, Detail, EnhanceMode, Quality, Resolution, SplitSize, ToolId } from '../types'

const store = useChat()
const prompt = ref('')
const modelId = ref('seedream')
const resolution = ref<Resolution>('2K')
const count = ref(1)
const quality = ref<Quality>('高')
const detail = ref<Detail>('中')
const ratio = ref<AspectRatio>('16:9')
const enhance = ref<EnhanceMode>('clarity')
const split = ref<SplitSize>(3)
const yaw = ref(28)
const pitch = ref(0)
const zoom = ref(1)
const wide = ref(12)
const direction = ref('tl')
const brightness = ref(1.12)
const temperature = ref(0)
const rim = ref(24)
const brush = ref(28)
const cropRatio = ref<AspectRatio | '自由'>('自由')
const crop = ref({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 })
const pixelW = ref(1024)
const pixelH = ref(1024)
const lockPixels = ref(true)
const working = ref(false)
const error = ref('')
const stageRef = ref<HTMLElement | null>(null)
const paintRef = ref<HTMLCanvasElement | null>(null)
const imageSize = ref({ w: 1, h: 1 })
const directions = [
  { id: 'tl', label: '左上' },
  { id: 'top', label: '上' },
  { id: 'tr', label: '右上' },
  { id: 'left', label: '左' },
  { id: 'right', label: '右' },
  { id: 'bl', label: '左下' },
  { id: 'bottom', label: '下' },
  { id: 'br', label: '右下' },
]

let painting = false
let lastPoint: { x: number; y: number } | null = null
let drag: null | {
  mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  x: number
  y: number
  crop: { x: number; y: number; w: number; h: number }
} = null

const editor = computed(() => store.editor)
const tool = computed(() => editor.value?.tool ?? 'redraw')
const autoModel = computed(() => (usesApi(tool.value) ? store.modelFor(tool.value) : null))
const model = computed(() => getModel(modelId.value))
const needsPaint = computed(() => tool.value === 'redraw' || tool.value === 'erase' || tool.value === 'annotate')
const generative = computed(() => TOOL_META[tool.value].generative)
const credits = computed(() =>
  estimateCredits({
    tool: tool.value,
    modelId: modelId.value,
    resolution: resolution.value,
    count: count.value,
    quality: quality.value,
    detail: detail.value,
  }),
)
const actionLabel = computed(() => (generative.value ? `生成 · ${credits.value} 点` : '完成'))
const cropStyle = computed(() => ({
  left: `${crop.value.x * 100}%`,
  top: `${crop.value.y * 100}%`,
  width: `${crop.value.w * 100}%`,
  height: `${crop.value.h * 100}%`,
}))
const lightOverlay = computed(() => {
  const map: Record<string, string> = {
    left: 'to right',
    right: 'to left',
    top: 'to bottom',
    bottom: 'to top',
    tl: 'to bottom right',
    tr: 'to bottom left',
    bl: 'to top right',
    br: 'to top left',
  }
  const amount = Math.min(0.75, Math.abs(temperature.value) / 70 + 0.12)
  const color = temperature.value >= 0 ? `rgba(255,176,92,${amount})` : `rgba(126,196,255,${amount})`
  return `linear-gradient(${map[direction.value] ?? 'to bottom right'}, ${color}, rgba(0,0,0,0.28))`
})
const angleStyle = computed(() => ({
  transform: `perspective(900px) rotateY(${yaw.value}deg) rotateX(${pitch.value}deg) scale(${zoom.value})`,
}))

watch(modelId, () => {
  resolution.value = model.value.resolutions.includes(resolution.value)
    ? resolution.value
    : model.value.resolutions[model.value.resolutions.length - 1]
})

watch(
  editor,
  async (value) => {
    if (!value) return
    prompt.value = value.prompt
    const chosen = store.modelFor(value.tool)
    modelId.value = chosen?.id ?? store.modelId
    resolution.value = model.value.resolutions.includes(store.resolution)
      ? store.resolution
      : model.value.resolutions[model.value.resolutions.length - 1]
    count.value = 1
    quality.value = store.quality
    error.value = ''
    split.value = value.grid ?? 3
    try {
      const image = await loadImage(value.sourceUrl)
      imageSize.value = { w: image.width, h: image.height }
      pixelW.value = image.width
      pixelH.value = image.height
      resetCrop()
      await nextTick()
      const canvas = paintRef.value
      if (!canvas) return
      canvas.width = image.width
      canvas.height = image.height
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    } catch {
      error.value = '这张源图无法打开。'
    }
  },
  { immediate: true },
)

watch(cropRatio, () => {
  if (editor.value) resetCrop()
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resetCrop() {
  if (cropRatio.value === '自由') {
    crop.value = { x: 0.06, y: 0.06, w: 0.88, h: 0.88 }
    return
  }
  const [a, b] = ratioValue(cropRatio.value)
  const target = a / b
  const imgW = imageSize.value.w
  const imgH = imageSize.value.h
  let w = (target * imgH) / imgW
  let h = 1
  if (w > 1) {
    w = 1
    h = imgW / (target * imgH)
  }
  w *= 0.94
  h *= 0.94
  crop.value = { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

function pointOf(event: PointerEvent): { x: number; y: number } | null {
  const canvas = paintRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function paintDown(event: PointerEvent) {
  painting = true
  ;(event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId)
  lastPoint = pointOf(event)
  strokeTo(event)
}

function strokeTo(event: PointerEvent) {
  if (!painting) return
  const canvas = paintRef.value
  const ctx = canvas?.getContext('2d')
  const next = pointOf(event)
  if (!canvas || !ctx || !next || !lastPoint) return
  ctx.strokeStyle = tool.value === 'annotate' ? 'rgba(194, 65, 12, 0.95)' : 'rgba(255, 64, 48, 0.62)'
  ctx.lineWidth = brush.value * (canvas.width / 720)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(lastPoint.x, lastPoint.y)
  ctx.lineTo(next.x, next.y)
  ctx.stroke()
  lastPoint = next
}

function paintUp() {
  painting = false
  lastPoint = null
}

function clearMask() {
  const canvas = paintRef.value
  if (!canvas) return
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
}

function startDrag(mode: 'move' | 'nw' | 'ne' | 'sw' | 'se', event: PointerEvent) {
  drag = { mode, x: event.clientX, y: event.clientY, crop: { ...crop.value } }
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag)
}

function onDrag(event: PointerEvent) {
  if (!drag || !stageRef.value) return
  const rect = stageRef.value.getBoundingClientRect()
  const dx = (event.clientX - drag.x) / rect.width
  const dy = (event.clientY - drag.y) / rect.height
  const start = drag.crop
  let x = start.x
  let y = start.y
  let w = start.w
  let h = start.h
  if (drag.mode === 'move') {
    x = clamp(start.x + dx, 0, 1 - start.w)
    y = clamp(start.y + dy, 0, 1 - start.h)
  } else {
    if (drag.mode.includes('e')) w = clamp(start.w + dx, 0.12, 1 - start.x)
    if (drag.mode.includes('s')) h = clamp(start.h + dy, 0.12, 1 - start.y)
    if (drag.mode.includes('w')) {
      const nextX = clamp(start.x + dx, 0, start.x + start.w - 0.12)
      w = start.w + (start.x - nextX)
      x = nextX
    }
    if (drag.mode.includes('n')) {
      const nextY = clamp(start.y + dy, 0, start.y + start.h - 0.12)
      h = start.h + (start.y - nextY)
      y = nextY
    }
    if (cropRatio.value !== '自由') {
      const [a, b] = ratioValue(cropRatio.value)
      h = (w * imageSize.value.w) / ((a / b) * imageSize.value.h)
      if (y + h > 1) {
        h = 1 - y
        w = (h * imageSize.value.h * (a / b)) / imageSize.value.w
      }
    }
  }
  crop.value = { x, y, w: clamp(w, 0.12, 1 - x), h: clamp(h, 0.12, 1 - y) }
}

function endDrag() {
  drag = null
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', endDrag)
}

onBeforeUnmount(endDrag)

function onPixelWidth(event: Event) {
  const next = Number((event.target as HTMLInputElement).value)
  if (lockPixels.value && pixelW.value > 0) {
    const keep = pixelH.value / pixelW.value
    pixelW.value = next
    pixelH.value = Math.round(next * keep)
    return
  }
  pixelW.value = next
}

async function markedSource(sourceUrl: string): Promise<string> {
  const canvas = paintRef.value
  if (!canvas || maskIsEmpty(canvas)) return sourceUrl
  const image = await loadImage(sourceUrl)
  const board = document.createElement('canvas')
  board.width = image.width
  board.height = image.height
  const ctx = board.getContext('2d')
  if (!ctx) return sourceUrl
  ctx.drawImage(image, 0, 0, image.width, image.height)
  ctx.drawImage(canvas, 0, 0, image.width, image.height)
  return board.toDataURL('image/jpeg', 0.86)
}

function defaultPrompt(current: ToolId): string {
  if (current === 'redraw') return '按涂抹区域重绘'
  if (current === 'annotate') return '标注重点区域'
  if (current === 'erase') return '擦除涂抹区域'
  return TOOL_META[current].label
}

async function apply() {
  const current = editor.value
  if (!current || working.value) return
  error.value = ''
  if (needsPaint.value && maskIsEmpty(paintRef.value)) {
    error.value = '先在图片上涂出区域。'
    return
  }
  if ((current.tool === 'redraw' || current.tool === 'annotate') && !prompt.value.trim()) {
    error.value = current.tool === 'redraw' ? '写清要把这块改成什么。' : '写一句标注说明。'
    return
  }
  working.value = true
  try {
    const urls: string[] = []
    if (current.tool === 'crop') urls.push(await cropImage(current.sourceUrl, crop.value))
    else if (current.tool === 'resize') urls.push(await resizeImage(current.sourceUrl, pixelW.value, pixelH.value))
    else if (current.tool === 'split') urls.push(...(await sliceGrid(current.sourceUrl, split.value)))
    else if (current.tool === 'cutout') urls.push(await cutoutImage(current.sourceUrl))
    else if (usesApi(current.tool)) {
      const chosen = store.modelFor(current.tool)
      if (!chosen) throw new Error('请先在左下角设置里接入平台 API。')
      let text = prompt.value.trim() || defaultPrompt(current.tool)
      if (current.tool === 'relight') text += `\n主光方向 ${direction.value}，亮度 ${brightness.value}，色温 ${temperature.value}，轮廓光 ${rim.value}。`
      if (current.tool === 'angle') text += `\n水平旋转 ${yaw.value} 度，倾斜 ${pitch.value} 度，远近 ${zoom.value}，广角 ${wide.value}。`
      const sourceUrl = needsPaint.value ? await markedSource(current.sourceUrl) : current.sourceUrl
      urls.push(
        ...(await store.requestImages({
          modelId: chosen.id,
          tool: current.tool,
          prompt: text,
          ratio: current.tool === 'outpaint' ? ratio.value : '1:1',
          resolution: normalizeResolution(chosen.id, resolution.value),
          count: current.tool === 'enhance' ? 1 : count.value,
          quality: quality.value,
          sourceUrl,
        })),
      )
    } else {
      const total = generative.value ? count.value : 1
      for (let index = 0; index < total; index += 1) {
        urls.push(
          await composeImage({
            prompt: prompt.value.trim() || defaultPrompt(current.tool),
            ratio: current.tool === 'outpaint' ? ratio.value : '1:1',
            seed: (Date.now() + index * 17) >>> 0,
            tool: current.tool,
            sourceUrl: current.sourceUrl,
            mask: paintRef.value,
            light: {
              direction: direction.value,
              brightness: brightness.value,
              temperature: temperature.value,
              rim: rim.value,
            },
            angle: { yaw: yaw.value, pitch: pitch.value, zoom: zoom.value, wide: wide.value },
            enhance: enhance.value,
            detail: detail.value,
          }),
        )
      }
    }
    const ratioLabel =
      current.tool === 'crop' ? (cropRatio.value === '自由' ? '自由' : cropRatio.value) : current.tool === 'outpaint' ? ratio.value : '1:1'
    const resolutionLabel =
      current.tool === 'resize'
        ? `${Math.min(1600, Math.round(pixelW.value))}×${Math.min(1600, Math.round(pixelH.value))}`
        : current.tool === 'enhance' && enhance.value === 'upscale'
          ? '4K'
          : resolution.value
    store.commitEdit({
      urls,
      prompt: prompt.value.trim() || defaultPrompt(current.tool),
      tool: current.tool,
      modelId: modelId.value,
      ratio: ratioLabel,
      resolution: resolutionLabel,
      transparent: current.tool === 'cutout',
      grid: null,
    })
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '这次处理没有完成，请再试一次。'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div v-if="editor" class="fixed inset-0 z-50 flex items-center justify-center bg-[#1c1917]/45 p-3 sm:p-6">
    <section class="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-paper shadow-2xl">
      <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <p class="text-sm font-medium">{{ TOOL_META[tool].label }}</p>
          <p class="text-xs text-stone-500">基于 {{ editor.sourceLabel }}，完成后会生成新图片，原图保留</p>
        </div>
        <button class="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-sand" :disabled="working" @click="store.closeEditor()">
          关闭
        </button>
      </header>
      <div class="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_300px]">
        <div class="flex min-h-[280px] items-center justify-center bg-[#ece7df] p-4">
          <div v-if="tool === 'outpaint'" class="relative h-[58vh] max-w-full bg-[#d9d3c8]" :style="{ aspectRatio: ratio.replace(':', ' / ') }">
            <img :src="editor.sourceUrl" alt="" class="absolute top-1/2 left-1/2 max-h-[72%] max-w-[72%] -translate-x-1/2 -translate-y-1/2 object-contain" />
          </div>
          <div v-else ref="stageRef" class="relative">
            <img
              :src="editor.sourceUrl"
              alt=""
              class="block max-h-[62vh] max-w-full select-none object-contain"
              :class="editor.transparent ? 'checker' : ''"
              :style="tool === 'angle' ? angleStyle : undefined"
              draggable="false"
            />
            <div v-if="tool === 'relight'" class="pointer-events-none absolute inset-0" :style="{ background: lightOverlay, mixBlendMode: 'soft-light' }" />
            <canvas
              v-if="needsPaint"
              ref="paintRef"
              class="absolute inset-0 h-full w-full cursor-crosshair touch-none"
              @pointerdown="paintDown"
              @pointermove="strokeTo"
              @pointerup="paintUp"
              @pointerleave="paintUp"
            />
            <div
              v-if="tool === 'crop'"
              class="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(28,25,23,0.45)]"
              :style="cropStyle"
              @pointerdown.stop.prevent="startDrag('move', $event)"
            >
              <i class="absolute -top-1.5 -left-1.5 h-3 w-3 bg-white" @pointerdown.stop.prevent="startDrag('nw', $event)" />
              <i class="absolute -top-1.5 -right-1.5 h-3 w-3 bg-white" @pointerdown.stop.prevent="startDrag('ne', $event)" />
              <i class="absolute -bottom-1.5 -left-1.5 h-3 w-3 bg-white" @pointerdown.stop.prevent="startDrag('sw', $event)" />
              <i class="absolute -right-1.5 -bottom-1.5 h-3 w-3 bg-white" @pointerdown.stop.prevent="startDrag('se', $event)" />
            </div>
          </div>
        </div>
        <div class="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-line p-4 md:border-t-0 md:border-l">
          <label v-if="tool === 'redraw' || tool === 'annotate' || tool === 'angle' || tool === 'outpaint'" class="block text-sm">
            <span class="text-stone-500">{{ tool === 'annotate' ? '标注说明' : '要改成什么' }}</span>
            <textarea v-model="prompt" rows="3" class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none" />
          </label>
          <div v-if="needsPaint" class="text-sm">
            <div class="flex items-center justify-between text-stone-500">
              <span>笔刷</span>
              <button class="text-xs" @click="clearMask">清除</button>
            </div>
            <input v-model.number="brush" class="mt-2 w-full" type="range" min="8" max="72" />
          </div>
          <div v-if="tool === 'crop'" class="flex flex-wrap gap-1.5">
            <button
              v-for="item in ['自由', ...FRAME_RATIOS]"
              :key="item"
              class="rounded-full px-2.5 py-1 text-xs"
              :class="cropRatio === item ? 'bg-ink text-white' : 'bg-white'"
              @click="cropRatio = item as AspectRatio | '自由'"
            >
              {{ item }}
            </button>
          </div>
          <div v-if="tool === 'angle'" class="space-y-2 text-sm">
            <label class="block text-stone-500">水平旋转 {{ yaw }}°</label>
            <input v-model.number="yaw" type="range" min="-75" max="75" class="w-full" />
            <label class="block text-stone-500">垂直倾斜 {{ pitch }}°</label>
            <input v-model.number="pitch" type="range" min="-40" max="40" class="w-full" />
            <label class="block text-stone-500">远近 {{ zoom.toFixed(2) }}</label>
            <input v-model.number="zoom" type="range" min="0.7" max="1.45" step="0.01" class="w-full" />
            <label class="block text-stone-500">广角 {{ wide }}</label>
            <input v-model.number="wide" type="range" min="0" max="100" class="w-full" />
          </div>
          <div v-if="tool === 'relight'" class="space-y-2 text-sm">
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="item in directions"
                :key="item.id"
                class="rounded-lg px-1 py-1.5 text-xs"
                :class="direction === item.id ? 'bg-ink text-white' : 'bg-white'"
                @click="direction = item.id"
              >
                {{ item.label }}
              </button>
            </div>
            <label class="block text-stone-500">亮度 {{ brightness.toFixed(2) }}</label>
            <input v-model.number="brightness" type="range" min="0.6" max="1.6" step="0.01" class="w-full" />
            <label class="block text-stone-500">色温 {{ temperature }}</label>
            <input v-model.number="temperature" type="range" min="-50" max="50" class="w-full" />
            <label class="block text-stone-500">轮廓光 {{ rim }}</label>
            <input v-model.number="rim" type="range" min="0" max="100" class="w-full" />
          </div>
          <div v-if="tool === 'outpaint'" class="flex flex-wrap gap-1.5">
            <button
              v-for="item in FRAME_RATIOS"
              :key="item"
              class="rounded-full px-2.5 py-1 text-xs"
              :class="ratio === item ? 'bg-ink text-white' : 'bg-white'"
              @click="ratio = item"
            >
              {{ item }}
            </button>
          </div>
          <label v-if="tool === 'outpaint'" class="flex items-center justify-between text-sm">
            <span class="text-stone-500">精细度</span>
            <select v-model="detail" class="rounded-lg border border-line bg-white px-2 py-1">
              <option v-for="item in DETAILS" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label v-if="tool === 'enhance'" class="flex items-center justify-between text-sm">
            <span class="text-stone-500">方式</span>
            <select v-model="enhance" class="rounded-lg border border-line bg-white px-2 py-1">
              <option value="clarity">清晰度</option>
              <option value="upscale">高清放大</option>
            </select>
          </label>
          <div v-if="tool === 'resize'" class="grid grid-cols-2 gap-2 text-sm">
            <label>宽<input class="mt-1 w-full rounded-lg border border-line px-2 py-1" type="number" min="64" max="1600" :value="pixelW" @change="onPixelWidth" /></label>
            <label>高<input v-model.number="pixelH" class="mt-1 w-full rounded-lg border border-line px-2 py-1" type="number" min="64" max="1600" :disabled="lockPixels" /></label>
            <label class="col-span-2 flex items-center gap-2 text-stone-500"><input v-model="lockPixels" type="checkbox" />锁定比例</label>
          </div>
          <div v-if="tool === 'split'" class="flex gap-2">
            <button
              v-for="item in [2, 3, 4]"
              :key="item"
              class="rounded-full px-3 py-1 text-sm"
              :class="split === item ? 'bg-ink text-white' : 'bg-white'"
              @click="split = item as SplitSize"
            >
              {{ item }}×{{ item }}
            </button>
          </div>
          <p v-if="tool === 'cutout'" class="text-sm leading-6 text-stone-500">会从画面边缘开始去掉与背景接近的颜色。生成后请放大检查头发和透明边缘。</p>
          <template v-if="usesApi(tool)">
            <div v-if="autoModel" class="flex items-center justify-between text-sm">
              <span class="text-stone-500">模型</span>
              <span>{{ autoModel.name }}</span>
            </div>
            <p v-else class="text-sm leading-6 text-stone-500">请先在左下角设置里接入平台 API。接入后会按这个工具自动选择内置模型。</p>
            <template v-if="autoModel">
            <label class="flex items-center justify-between text-sm">
              <span class="text-stone-500">清晰度</span>
              <select v-model="resolution" class="rounded-lg border border-line bg-white px-2 py-1">
                <option v-for="item in model.resolutions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label v-if="tool !== 'cutout' && tool !== 'enhance'" class="flex items-center justify-between text-sm">
              <span class="text-stone-500">数量</span>
              <select v-model.number="count" class="rounded-lg border border-line bg-white px-2 py-1">
                <option v-for="item in [1, 2, 3, 4]" :key="item" :value="item">{{ item }} 张</option>
              </select>
            </label>
            <label v-if="model.qualities" class="flex items-center justify-between text-sm">
              <span class="text-stone-500">质量</span>
              <select v-model="quality" class="rounded-lg border border-line bg-white px-2 py-1">
                <option v-for="item in model.qualities" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            </template>
          </template>
          <p v-if="error" class="text-sm text-ember">{{ error }}</p>
          <button class="mt-auto rounded-full bg-ember py-2 text-sm font-medium text-white disabled:opacity-50" :disabled="working || (usesApi(tool) && !autoModel)" @click="apply">
            {{ working ? '处理中' : actionLabel }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
