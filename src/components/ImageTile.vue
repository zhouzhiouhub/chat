<script setup lang="ts">
import { ref } from 'vue'
import { MORE_TOOLS, PRIMARY_TOOLS, TOOL_META } from '../lib/catalog'
import { downloadDataUrl } from '../lib/render'
import { useChat } from '../lib/store'
import type { ImageAsset, ToolId } from '../types'

const props = defineProps<{ image: ImageAsset; gallery: ImageAsset[] }>()
const store = useChat()
const more = ref(false)

function openTool(tool: ToolId) {
  more.value = false
  store.openEditor(props.image, tool)
}
</script>

<template>
  <figure class="group relative overflow-hidden rounded-2xl border border-line bg-white" :class="more ? 'z-30' : ''">
    <button
      class="block w-full"
      :aria-label="`查看${image.label}`"
      @click="store.openLightbox(gallery, Math.max(0, gallery.findIndex((item) => item.id === image.id)))"
    >
      <span class="block" :class="image.transparent ? 'checker' : 'bg-sand'">
        <img :src="image.url" :alt="image.prompt" class="aspect-auto max-h-[420px] w-full object-contain" />
      </span>
    </button>
    <figcaption class="flex items-center justify-between gap-2 px-3 py-2 text-xs text-stone-500">
      <span class="truncate">{{ image.label }} · {{ TOOL_META[image.tool].label }}</span>
      <span class="shrink-0">{{ image.ratio }} · {{ image.resolution }}</span>
    </figcaption>
    <div class="flex flex-wrap gap-1 border-t border-line px-2 py-2">
      <button
        v-for="tool in PRIMARY_TOOLS"
        :key="tool"
        class="rounded-full px-2.5 py-1 text-xs hover:bg-sand"
        @click="openTool(tool)"
      >
        {{ TOOL_META[tool].label }}
      </button>
      <div class="relative">
        <button class="rounded-full px-2.5 py-1 text-xs hover:bg-sand" @click="more = !more">更多</button>
        <div v-if="more" class="absolute bottom-9 left-0 z-20 w-36 rounded-xl border border-line bg-white p-1 shadow-lg">
          <button
            v-for="tool in MORE_TOOLS"
            :key="tool"
            class="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-sand"
            @click="openTool(tool)"
          >
            {{ TOOL_META[tool].label }}
          </button>
        </div>
      </div>
      <button class="rounded-full px-2.5 py-1 text-xs hover:bg-sand" @click="store.quoteImage(image)">引用</button>
      <button
        class="rounded-full px-2.5 py-1 text-xs hover:bg-sand"
        @click="downloadDataUrl(image.url, `${image.label}.jpg`)"
      >
        下载
      </button>
    </div>
    <button v-if="more" class="fixed inset-0 z-10 cursor-default" aria-label="关闭菜单" @click="more = false" />
  </figure>
</template>
