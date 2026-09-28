<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { COMMANDS, getModel, modelsForPlatform, PLATFORMS, RATIOS, ROLES, TOOL_META } from '../lib/catalog'
import { useChat } from '../lib/store'
import type { ImageAsset, Resolution, ToolId } from '../types'

const store = useChat()
const box = ref<HTMLTextAreaElement | null>(null)
const fileRef = ref<HTMLInputElement | null>(null)
const slashIndex = ref(0)
const mentionIndex = ref(0)

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

function insert(token: string) {
  const prefix = store.draft && !store.draft.endsWith(' ') ? `${store.draft} ` : store.draft
  store.draft = `${prefix}${token}`
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

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  await store.addFiles([...(input.files ?? [])])
  input.value = ''
}

async function onDrop(event: DragEvent) {
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length) await store.addFiles(files)
}

function onResolution(event: Event) {
  store.resolution = (event.target as HTMLSelectElement).value as Resolution
}
</script>

<template>
  <div class="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
    <div
      class="relative mx-auto w-full max-w-3xl rounded-[28px] border border-line bg-white shadow-[0_10px_30px_rgba(28,25,23,0.05)]"
      @dragover.prevent
      @drop.prevent="onDrop"
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
        <span
          v-for="item in store.attachments"
          :key="item.id"
          class="inline-flex items-center gap-1.5 rounded-full border border-line py-1 pr-1.5 pl-1 text-xs"
        >
          <img :src="item.url" alt="" class="h-6 w-6 rounded-full object-cover" />
          <span class="max-w-24 truncate">{{ item.name }}</span>
          <select
            class="rounded-md bg-transparent"
            :value="item.role"
            @change="store.setAttachmentRole(item.id, ($event.target as HTMLSelectElement).value as typeof item.role)"
          >
            <option v-for="role in ROLES" :key="role.id" :value="role.id">{{ role.label }}</option>
          </select>
          <button class="px-1 text-stone-500" :aria-label="`移除${item.name}`" @click="store.removeAttachment(item.id)">×</button>
        </span>
      </div>

      <textarea
        ref="box"
        v-model="store.draft"
        rows="1"
        class="max-h-40 w-full bg-transparent px-4 pt-3 pb-1 text-sm leading-6 outline-none"
        :placeholder="showImageOptions ? '描述主体、环境、构图、光线和风格。用 @ 引用图片，用 / 调用工具' : '输入问题。用 / 调用图片工具，用 @ 引用图片'"
        @keydown="onKeydown"
      />

      <div class="flex flex-wrap items-center gap-1.5 px-2 pt-1 pb-2">
        <input ref="fileRef" class="hidden" type="file" accept="image/*" multiple @change="onFiles" />
        <button class="rounded-full px-2.5 py-1.5 text-sm hover:bg-sand" @click="fileRef?.click()">图片</button>
        <button class="rounded-full px-2.5 py-1.5 text-sm hover:bg-sand" @click="insert('/')">/</button>
        <button class="rounded-full px-2.5 py-1.5 text-sm hover:bg-sand" :disabled="!gallery.length" @click="insert('@')">@</button>
        <select
          v-if="modelGroups.length"
          v-model="store.modelId"
          class="max-w-56 truncate rounded-full border border-line bg-white px-2 py-1 text-xs"
          aria-label="模型"
        >
          <option value="auto">Auto</option>
          <optgroup v-for="group in modelGroups" :key="group.id" :label="group.name">
            <option v-for="model in group.models" :key="model.id" :value="model.id">
              {{ model.name }}
            </option>
          </optgroup>
        </select>
        <button v-else class="rounded-full border border-line bg-white px-2.5 py-1 text-xs" @click="store.openSettings()">未接入模型</button>
        <template v-if="showImageOptions">
        <select v-model="store.ratio" class="rounded-full border border-line bg-white px-2 py-1 text-xs" aria-label="比例">
          <option v-for="item in RATIOS" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model.number="store.count" class="rounded-full border border-line bg-white px-2 py-1 text-xs" aria-label="数量">
          <option v-for="item in [1, 2, 3, 4]" :key="item" :value="item">{{ item }} 张</option>
        </select>
        <select class="rounded-full border border-line bg-white px-2 py-1 text-xs" aria-label="清晰度" :value="store.resolution" @change="onResolution">
          <option value="1K">1K</option>
          <option value="2K">2K</option>
          <option value="4K">4K</option>
        </select>
        </template>
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
