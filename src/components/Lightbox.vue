<script setup lang="ts">
import { computed } from 'vue'
import { downloadDataUrl } from '../lib/render'
import { useChat } from '../lib/store'

const store = useChat()
const current = computed(() => store.lightbox?.images[store.lightbox.index] ?? null)
</script>

<template>
  <div
    v-if="store.lightbox && current"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-[#1c1917]/80 p-4"
    @click.self="store.closeLightbox()"
  >
    <button class="absolute top-4 right-4 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white" @click="store.closeLightbox()">
      关闭
    </button>
    <button
      v-if="store.lightbox.images.length > 1"
      class="absolute left-4 rounded-full bg-white/10 px-3 py-2 text-white"
      aria-label="上一张"
      @click="store.shiftLightbox(-1)"
    >
      ‹
    </button>
    <img
      :src="current.url"
      :alt="current.prompt"
      class="max-h-[88vh] max-w-[88vw] rounded-xl object-contain"
      :class="current.transparent ? 'checker' : ''"
    />
    <button
      v-if="store.lightbox.images.length > 1"
      class="absolute right-4 rounded-full bg-white/10 px-3 py-2 text-white"
      aria-label="下一张"
      @click="store.shiftLightbox(1)"
    >
      ›
    </button>
    <button
      class="absolute bottom-4 rounded-full bg-white px-4 py-1.5 text-sm"
      @click="downloadDataUrl(current.url, `${current.label}.jpg`)"
    >
      下载
    </button>
  </div>
</template>
