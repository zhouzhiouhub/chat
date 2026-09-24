<script setup lang="ts">
import { provide } from 'vue'
import Composer from './components/Composer.vue'
import EditorDialog from './components/EditorDialog.vue'
import Lightbox from './components/Lightbox.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import Sidebar from './components/Sidebar.vue'
import Thread from './components/Thread.vue'
import { chatKey, createChatStore } from './lib/store'

const store = createChatStore()
provide(chatKey, store)
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-paper text-ink">
    <Sidebar />
    <main class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-3 border-b border-line px-4 py-3">
        <button class="rounded-full px-2 py-1 text-sm hover:bg-sand md:hidden" @click="store.sidebarOpen = true">对话</button>
        <h1 class="min-w-0 flex-1 truncate text-sm font-medium">{{ store.settingsOpen ? '设置' : store.active?.title || '新对话' }}</h1>
        <div v-if="!store.settingsOpen" class="flex rounded-full bg-sand p-1 text-xs" role="group" aria-label="生成方式">
          <button
            class="rounded-full px-3 py-1.5"
            :class="store.mode === 'confirm' ? 'bg-white shadow-sm' : 'text-stone-500'"
            @click="store.setMode('confirm')"
          >
            手动确认
          </button>
          <button
            class="rounded-full px-3 py-1.5"
            :class="store.mode === 'auto' ? 'bg-white shadow-sm' : 'text-stone-500'"
            @click="store.setMode('auto')"
          >
            自动生成
          </button>
        </div>
      </header>
      <SettingsPanel v-if="store.settingsOpen" />
      <template v-else>
        <Thread />
        <Composer />
      </template>
    </main>
    <EditorDialog />
    <Lightbox />
  </div>
</template>
