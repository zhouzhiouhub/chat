<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import logoUrl from '../assets/kinolin-logo.svg'
import { COMMANDS } from '../lib/catalog'
import { useChat } from '../lib/store'
import type { Conversation, ToolId } from '../types'

const store = useChat()
const searchOpen = ref(false)
const query = ref('')
const taskOpen = ref(false)
const searchBox = ref<HTMLInputElement | null>(null)

const tasks: { tool: ToolId | null; label: string }[] = [
  { tool: null, label: '对话' },
  ...COMMANDS.map((item) => ({ tool: item.tool, label: item.label })),
]

const groups = computed(() => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const buckets = new Map<string, Conversation[]>()
  const needle = query.value.trim().toLowerCase()
  const ordered = [...store.chats].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const chat of ordered) {
    if (needle && !chat.title.toLowerCase().includes(needle) && !chat.messages.some((message) => message.text.toLowerCase().includes(needle))) continue
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

async function openSearch() {
  taskOpen.value = false
  searchOpen.value = true
  await nextTick()
  searchBox.value?.focus()
}

function closeSearch() {
  searchOpen.value = false
  query.value = ''
}

function chooseTask(tool: ToolId | null) {
  store.setPendingTool(tool)
  store.closeSettings()
  taskOpen.value = false
}
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
      <div class="flex items-center gap-1 px-3 pb-2 pt-4">
        <img :src="logoUrl" alt="kinolin" class="mr-auto h-11 w-auto" />
        <button
          class="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-white hover:text-ink"
          :class="searchOpen ? 'bg-white text-ink' : ''"
          aria-label="搜索"
          title="搜索"
          @click="searchOpen ? closeSearch() : openSearch()"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
        </button>
        <div class="relative">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-white hover:text-ink"
            :class="taskOpen || store.pendingTool ? 'bg-white text-ink' : ''"
            aria-label="任务"
            title="任务"
            :aria-expanded="taskOpen"
            @click="taskOpen = !taskOpen; searchOpen && closeSearch()"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <button v-if="taskOpen" class="fixed inset-0 z-20 cursor-default" aria-label="关闭任务" @click="taskOpen = false" />
          <div v-if="taskOpen" class="absolute top-full right-0 z-30 mt-1 max-h-80 w-44 overflow-auto rounded-2xl border border-line bg-white p-1 shadow-lg">
            <button
              v-for="task in tasks"
              :key="task.label"
              class="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm"
              :class="store.pendingTool === task.tool ? 'bg-sand' : 'hover:bg-sand'"
              @click="chooseTask(task.tool)"
            >
              {{ task.label }}
            </button>
          </div>
        </div>
        <button
          class="rounded-full px-2 py-1 text-sm text-stone-500 hover:bg-white md:hidden"
          @click="store.sidebarOpen = false"
        >
          关闭
        </button>
      </div>
      <div v-if="searchOpen" class="px-3 pb-2">
        <input
          ref="searchBox"
          v-model="query"
          class="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none"
          placeholder="搜索对话"
          @keydown.escape="closeSearch"
        />
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
        <p v-if="searchOpen && query.trim() && !groups.length" class="px-2 py-6 text-center text-sm text-stone-500">没有找到对话</p>
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
