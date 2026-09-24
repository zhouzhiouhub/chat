<script setup lang="ts">
import { computed } from 'vue'
import {
  DETAILS,
  estimateCredits,
  FRAME_RATIOS,
  getModel,
  MODELS,
  RATIOS,
  roleLabel,
  TOOL_META,
} from '../lib/catalog'
import type { ConfirmSpec, Detail, EnhanceMode, Quality, Resolution } from '../types'

const props = defineProps<{ spec: ConfirmSpec }>()
const emit = defineEmits<{
  approve: []
  cancel: []
  patch: [patch: Partial<ConfirmSpec>]
}>()

const model = computed(() => getModel(props.spec.modelId))
const locked = computed(() => props.spec.status !== 'pending')
const credits = computed(() =>
  estimateCredits({
    tool: props.spec.tool,
    modelId: props.spec.modelId,
    resolution: props.spec.resolution,
    count: props.spec.count,
    quality: props.spec.quality,
    detail: props.spec.detail,
  }),
)
const showCount = computed(() => !['grid', 'split', 'crop', 'resize', 'cutout', 'annotate'].includes(props.spec.tool))
const showRatio = computed(() => ['generate', 'grid', 'outpaint', 'crop'].includes(props.spec.tool))

function valueOf(event: Event): string {
  return (event.target as HTMLSelectElement).value
}

function onQuality(event: Event) {
  emit('patch', { quality: valueOf(event) as Quality })
}

function onResolution(event: Event) {
  emit('patch', { resolution: valueOf(event) as Resolution })
}

function onDetail(event: Event) {
  emit('patch', { detail: valueOf(event) as Detail })
}

function onEnhance(event: Event) {
  emit('patch', { enhance: valueOf(event) as EnhanceMode })
}
</script>

<template>
  <section class="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
    <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <p class="text-sm font-medium">{{ spec.status === 'done' ? '已完成' : spec.status === 'cancelled' ? '未生成' : '准备生成' }}</p>
        <p class="text-xs text-stone-500">{{ TOOL_META[spec.tool].label }}</p>
      </div>
      <p class="text-sm tabular-nums text-stone-500">{{ credits ? `${credits} 点` : '不消耗点数' }}</p>
    </header>

    <p v-if="spec.status === 'done'" class="px-4 py-3 text-sm text-stone-600">{{ spec.summary }}</p>
    <p v-else-if="spec.status === 'cancelled'" class="px-4 py-3 text-sm text-stone-500">这次没有调用模型。</p>

    <div v-else class="divide-y divide-line text-sm">
      <label v-if="TOOL_META[spec.tool].generative" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">模型</span>
        <select
          class="max-w-[220px] rounded-lg border border-line bg-white px-2 py-1"
          :disabled="locked"
          :value="spec.modelId"
          @change="emit('patch', { modelId: valueOf($event) })"
        >
          <option v-for="item in MODELS" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <label v-if="showRatio" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">比例</span>
        <select
          class="rounded-lg border border-line bg-white px-2 py-1"
          :disabled="locked"
          :value="spec.ratio"
          @change="emit('patch', { ratio: valueOf($event) as ConfirmSpec['ratio'] })"
        >
          <option v-for="item in spec.tool === 'generate' || spec.tool === 'grid' ? RATIOS : FRAME_RATIOS" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
      </label>
      <label v-if="TOOL_META[spec.tool].generative" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">清晰度</span>
        <select class="rounded-lg border border-line bg-white px-2 py-1" :disabled="locked" :value="spec.resolution" @change="onResolution">
          <option v-for="item in model.resolutions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label v-if="showCount" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">数量</span>
        <select
          class="rounded-lg border border-line bg-white px-2 py-1"
          :disabled="locked"
          :value="spec.count"
          @change="emit('patch', { count: Number(valueOf($event)) })"
        >
          <option v-for="item in [1, 2, 3, 4]" :key="item" :value="item">{{ item }} 张</option>
        </select>
      </label>
      <label v-if="model.qualities && TOOL_META[spec.tool].generative" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">质量</span>
        <select class="rounded-lg border border-line bg-white px-2 py-1" :disabled="locked" :value="spec.quality" @change="onQuality">
          <option v-for="item in model.qualities" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label v-if="spec.tool === 'outpaint'" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">精细度</span>
        <select class="rounded-lg border border-line bg-white px-2 py-1" :disabled="locked" :value="spec.detail" @change="onDetail">
          <option v-for="item in DETAILS" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label v-if="spec.tool === 'enhance'" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">增强</span>
        <select class="rounded-lg border border-line bg-white px-2 py-1" :disabled="locked" :value="spec.enhance" @change="onEnhance">
          <option value="clarity">清晰度</option>
          <option value="upscale">高清放大</option>
        </select>
      </label>
      <div v-if="spec.sourceLabel" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <span class="text-stone-500">源图</span>
        <span>{{ spec.sourceLabel }}</span>
      </div>
      <div v-if="spec.references.length" class="px-4 py-2.5">
        <p class="text-stone-500">参考</p>
        <p class="mt-1 text-right">
          <span v-for="(item, index) in spec.references" :key="`${item.name}-${index}`">
            {{ item.name }} · {{ roleLabel(item.role) }}<span v-if="index < spec.references.length - 1">，</span>
          </span>
        </p>
      </div>
      <div v-if="spec.status === 'generating'" class="px-4 py-3">
        <div class="h-1 overflow-hidden rounded-full bg-sand">
          <div class="pulse-bar h-full w-1/3 rounded-full bg-ink" />
        </div>
        <p class="mt-2 text-xs text-stone-500">正在生成预览，完成后可以打开大图检查。</p>
      </div>
    </div>

    <footer v-if="spec.status === 'pending'" class="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
      <button class="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-sand" @click="emit('cancel')">取消</button>
      <button class="rounded-full bg-ember px-4 py-1.5 text-sm font-medium text-white hover:bg-[#9a3412]" @click="emit('approve')">
        {{ credits ? `生成 · ${credits} 点` : '完成' }}
      </button>
    </footer>
  </section>
</template>
