<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { COMMANDS, getModel, modelsForPlatform, PLATFORMS, TOOL_META } from '../lib/catalog'
import { fileFromImageUrl, imageFilesFromTransfer, imageSrcsFromTransfer } from '../lib/clipboard'
import { useChat } from '../lib/store'
import type { ImageAsset, ToolId } from '../types'

const store = useChat()
const box = ref<HTMLTextAreaElement | null>(null)
const slashIndex = ref(0)
const mentionIndex = ref(0)
const modelOpen = ref(false)

const gallery = computed(() => store.active?.messages.flatMap((message) => message.images) ?? [])
const slashQuery = computed(() => {
  const match = store.draft.match(/\/([^\s/]*)$/)
  return match ? match[1] : null
})
const mentionQuery = computed(() => {
  if (slashQuery.value !== null) return null
  const match = store.draft.match(/@([^\s@]*)$/)
  return match ? match[1] : null
})
const slashItems = computed(() => {
  if (slashQuery.value === null) return []
  return COMMANDS.filter((item) => item.label.includes(slashQuery.value!) || item.slash.includes(slashQuery.value!))
})
const mentionItems = computed(() => {
  if (mentionQuery.value === null) return []
  return gallery.value.filter((image) => image.label.includes(mentionQuery.value!))
})
const modelGroups = computed(() =>
  PLATFORMS.flatMap((platform) => {
    if (!store.connectedIds.includes(platform.id)) return []
    const models = modelsForPlatform(platform.id)
    return models.length ? [{ id: platform.id, name: platform.name, models }] : []
  }),
)
const pickedModel = computed(() => {
  const model = getModel(store.modelId)
  return model.id === store.modelId ? model : null
})
const modelLabel = computed(() => pickedModel.value?.name ?? 'Auto')
const showImageOptions = computed(() => !pickedModel.value || pickedModel.value.kind === 'image')
const canSend = computed(() => Boolean(store.draft.trim() || store.attachments.length || store.pendingTool))

watch(
  () => store.draft,
  async () => {
    slashIndex.value = 0
    mentionIndex.value = 0
    await nextTick()
    const el = box.value
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(168, el.scrollHeight)}px`
  },
)

function focusInput() {
  box.value?.focus()
}

function chooseModel(id: string) {
  store.modelId = id
  modelOpen.value = false
  focusInput()
}

function chooseCommand(tool: ToolId) {
  store.draft = store.draft.replace(/\/[^\s/]*$/, '').trimEnd()
  store.setPendingTool(tool)
  focusInput()
}

function chooseImage(image: ImageAsset) {
  store.draft = store.draft.replace(/@[^\s@]*$/, '').trimEnd()
  store.quoteImage(image)
  focusInput()
}

function onKeydown(event: KeyboardEvent) {
  const slashOpen = slashItems.value.length > 0
  const mentionOpen = mentionItems.value.length > 0
  if ((slashOpen || mentionOpen) && event.key === 'ArrowDown') {
    event.preventDefault()
    if (slashOpen) slashIndex.value = (slashIndex.value + 1) % slashItems.value.length
    else mentionIndex.value = (mentionIndex.value + 1) % mentionItems.value.length
    return
  }
  if ((slashOpen || mentionOpen) && event.key === 'ArrowUp') {
    event.preventDefault()
    if (slashOpen) slashIndex.value = (slashIndex.value - 1 + slashItems.value.length) % slashItems.value.length
    else mentionIndex.value = (mentionIndex.value - 1 + mentionItems.value.length) % mentionItems.value.length
    return
  }
  if ((slashOpen || mentionOpen) && (event.key === 'Enter' || event.key === 'Tab')) {
    event.preventDefault()
    if (slashOpen) chooseCommand(slashItems.value[slashIndex.value].tool)
    else chooseImage(mentionItems.value[mentionIndex.value])
    return
  }
  if (event.key === 'Escape') {
    store.draft = store.draft.replace(/[/@][^\s/@]*$/, '')
    return
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    if (store.busy) return
    void store.send()
  }
}

async function addTransferImages(files: File[], srcs: string[]) {
  if (files.length) {
    await store.addFiles(files)
    return
  }
  for (const image of gallery.value) {
    if (srcs.includes(image.url)) store.quoteImage(image)
  }
  const known = new Set(gallery.value.map((image) => image.url))
  const fetched = (await Promise.all(srcs.filter((src) => !known.has(src)).map((src) => fileFromImageUrl(src)))).filter(
    (file) => file !== null,
  )
  if (fetched.length) await store.addFiles(fetched)
}

async function onPaste(event: ClipboardEvent) {
  if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return
  const files = imageFilesFromTransfer(event.clipboardData)
  const srcs = files.length ? [] : imageSrcsFromTransfer(event.clipboardData)
  if (!files.length && !srcs.length) return
  event.preventDefault()
  await addTransferImages(files, srcs)
}

async function onDrop(event: DragEvent) {
  const files = imageFilesFromTransfer(event.dataTransfer)
  const srcs = files.length ? [] : imageSrcsFromTransfer(event.dataTransfer)
  if (!files.length && !srcs.length) return
  await addTransferImages(files, srcs)
}

</script>

<template>
  <div class="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
    <div
      class="relative mx-auto w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_10px_30px_rgba(28,25,23,0.05)]"
      @dragover.prevent
      @drop.prevent="onDrop"
      @paste="onPaste"
    >
      <div
        v-if="slashItems.length"
        class="absolute bottom-full left-4 z-20 mb-2 w-[min(100%-2rem,320px)] overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
      >
        <button
          v-for="(item, index) in slashItems"
          :key="item.tool"
          class="block w-full px-3 py-2 text-left"
          :class="index === slashIndex ? 'bg-sand' : 'hover:bg-[#faf8f5]'"
          @mousedown.prevent="chooseCommand(item.tool)"
        >
          <span class="block text-sm">{{ item.label }}</span>
          <span class="block text-xs text-stone-500">/{{ item.slash }} · {{ item.hint }}</span>
        </button>
      </div>
      <div
        v-if="mentionItems.length"
        class="absolute bottom-full left-4 z-20 mb-2 max-h-64 w-[min(100%-2rem,280px)] overflow-auto rounded-2xl border border-line bg-white shadow-lg"
      >
        <button
          v-for="(image, index) in mentionItems"
          :key="image.id"
          class="flex w-full items-center gap-2 px-3 py-2 text-left"
          :class="index === mentionIndex ? 'bg-sand' : 'hover:bg-[#faf8f5]'"
          @mousedown.prevent="chooseImage(image)"
        >
          <img :src="image.url" alt="" class="h-8 w-8 rounded-md object-cover" />
          <span class="text-sm">{{ image.label }}</span>
        </button>
      </div>

      <div v-if="store.attachments.length || store.pendingTool" class="flex flex-wrap gap-2 px-4 pt-3">
        <span v-if="store.pendingTool" class="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-xs">
          {{ TOOL_META[store.pendingTool].label }}
          <button class="text-stone-500" aria-label="移除工具" @click="store.setPendingTool(null)">×</button>
        </span>
        <span v-for="item in store.attachments" :key="item.id" class="group relative">
          <img :src="item.url" alt="" class="h-10 w-10 rounded-xl object-cover" />
          <button
            class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] leading-none text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
            :aria-label="`移除${item.name}`"
            @click="store.removeAttachment(item.id)"
          >
            ×
          </button>
        </span>
      </div>

      <textarea
        ref="box"
        v-model="store.draft"
        rows="1"
        class="max-h-40 w-full bg-transparent px-4 pt-3 pb-1 text-sm leading-6 outline-none"
        :placeholder="showImageOptions ? '描述画面。可粘贴图片，@ 引用，/ 工具' : '输入问题。可粘贴图片'"
        @keydown="onKeydown"
      />

      <div class="flex flex-wrap items-center gap-1.5 px-3 pt-1 pb-2">
        <div v-if="modelGroups.length" class="relative">
          <button
            class="max-w-56 truncate rounded-full border border-white bg-white px-2 py-1 text-xs text-stone-500 hover:text-ink"
            aria-label="模型"
            :aria-expanded="modelOpen"
            @click="modelOpen = !modelOpen"
          >
            {{ modelLabel }}
          </button>
          <button v-if="modelOpen" class="fixed inset-0 z-20 cursor-default" aria-label="关闭模型" @click="modelOpen = false" />
          <div v-if="modelOpen" class="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-52 overflow-auto rounded-2xl border border-line bg-white p-1 shadow-lg">
            <button
              class="block w-full rounded-lg px-2 py-1.5 text-left text-xs"
              :class="store.modelId === 'auto' ? 'bg-sand' : 'hover:bg-sand'"
              @click="chooseModel('auto')"
            >
              Auto
            </button>
            <div v-for="group in modelGroups" :key="group.id" class="mt-1">
              <p class="px-2 pt-1 text-[11px] text-stone-400">{{ group.name }}</p>
              <button
                v-for="model in group.models"
                :key="model.id"
                class="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs"
                :class="store.modelId === model.id ? 'bg-sand' : 'hover:bg-sand'"
                @click="chooseModel(model.id)"
              >
                {{ model.name }}
              </button>
            </div>
          </div>
        </div>
        <button v-else class="rounded-full border border-white bg-white px-2 py-1 text-xs text-stone-500 hover:text-ink" @click="store.openSettings()">未接入模型</button>
        <span class="flex-1" />
        <button
          v-if="store.busy"
          class="rounded-full bg-ink px-4 py-1.5 text-sm text-white"
          @click="store.stop()"
        >
          停止
        </button>
        <button
          v-else
          class="rounded-full bg-ink px-4 py-1.5 text-sm text-white disabled:opacity-30"
          :disabled="!canSend"
          @click="store.send()"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>
