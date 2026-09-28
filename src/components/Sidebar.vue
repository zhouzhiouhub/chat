<script setup lang="ts">
import { computed } from 'vue'
import { useChat } from '../lib/store'
import type { Conversation } from '../types'

const store = useChat()

const groups = computed(() => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const buckets = new Map<string, Conversation[]>()
  const ordered = [...store.chats].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const chat of ordered) {
    const label = chat.updatedAt >= start ? '今天' : chat.updatedAt >= start - 86_400_000 ? '昨天' : '更早'
    const list = buckets.get(label) ?? []
    list.push(chat)
    buckets.set(label, list)
  }
  return ['今天', '昨天', '更早'].flatMap((label) => {
    const items = buckets.get(label)
    return items ? [{ label, items }] : []
  })
})
</script>

<template>
  <div class="h-full shrink-0">
    <button
      v-if="store.sidebarOpen"
      class="fixed inset-0 z-30 bg-[#1c1917]/30 md:hidden"
      aria-label="关闭侧栏"
      @click="store.sidebarOpen = false"
    />
    <aside
      class="fixed inset-y-0 left-0 z-40 flex h-dvh w-[272px] flex-col border-r border-line bg-sand transition-transform md:static md:h-full md:translate-x-0"
      :class="store.sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <p class="font-serif text-2xl leading-none">绘话</p>
          <p class="mt-1 text-xs text-stone-500">图片 Agent</p>
        </div>
        <button
          class="rounded-full px-2 py-1 text-sm text-stone-500 hover:bg-white md:hidden"
          @click="store.sidebarOpen = false"
        >
          关闭
        </button>
      </div>
      <div class="px-3 py-2">
        <button
          class="flex w-full items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 text-sm font-medium hover:bg-[#faf8f5]"
          @click="store.newChat()"
        >
          <span class="text-base leading-none">+</span>
          新对话
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <section v-for="group in groups" :key="group.label" class="mt-4">
          <p class="px-2 pb-1 text-xs text-stone-500">{{ group.label }}</p>
          <div
            v-for="chat in group.items"
            :key="chat.id"
            class="group flex w-full items-center gap-1 rounded-xl pr-1"
            :class="chat.id === store.activeId ? 'bg-white shadow-sm' : 'hover:bg-white/70'"
          >
            <button class="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm" @click="store.selectChat(chat.id)">
              {{ chat.title }}
            </button>
            <button
              class="shrink-0 rounded-md px-1.5 text-stone-400 opacity-0 hover:bg-sand hover:text-ink group-hover:opacity-100"
              aria-label="删除对话"
              @click="store.deleteChat(chat.id)"
            >
              ×
            </button>
          </div>
        </section>
      </div>
      <div class="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          class="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm"
          :class="store.settingsOpen ? 'bg-white shadow-sm' : 'hover:bg-white/70'"
          @click="store.openSettings()"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
          </svg>
          设置
        </button>
      </div>
    </aside>
  </div>
</template>
