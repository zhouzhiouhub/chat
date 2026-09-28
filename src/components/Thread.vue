<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import logoUrl from '../assets/kinolin-logo.svg'
import symbolUrl from '../assets/kinolin-symbol.svg'
import ConfirmCard from './ConfirmCard.vue'
import ImageTile from './ImageTile.vue'
import { ratioValue, resolveRatio, SUGGESTIONS } from '../lib/catalog'
import { fileFromImageUrl, imageFilesFromTransfer, imageSrcsFromTransfer } from '../lib/clipboard'
import { useChat } from '../lib/store'
import type { AspectRatio, Message } from '../types'

const store = useChat()
const scroller = ref<HTMLElement | null>(null)
const editingId = ref<string | null>(null)
const editText = ref('')
const latestUserId = computed(() => [...(store.active?.messages ?? [])].reverse().find((item) => item.role === 'user')?.id ?? '')

watch(
  () => store.pulse,
  async () => {
    await nextTick()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
  },
)

function aspect(ratio: AspectRatio, prompt: string): string {
  const [w, h] = ratioValue(resolveRatio(ratio, prompt))
  return `${w} / ${h}`
}

function columns(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-xl'
  if (count === 2) return 'grid-cols-2'
  return 'sm:grid-cols-3 grid-cols-2'
}

function startEdit(message: Message) {
  editingId.value = message.id
  editText.value = message.text
}

async function submitEdit(message: Message) {
  const text = editText.value
  if (!text.trim() || store.busy) return
  editingId.value = null
  await store.resend(message.id, text)
}

async function onEditPaste(message: Message, event: ClipboardEvent) {
  const files = imageFilesFromTransfer(event.clipboardData)
  const srcs = files.length ? [] : imageSrcsFromTransfer(event.clipboardData)
  if (!files.length && !srcs.length) return
  event.preventDefault()
  if (files.length) {
    await store.addFiles(files, message.id)
    return
  }
  const fetched = (await Promise.all(srcs.map((src) => fileFromImageUrl(src)))).filter((file) => file !== null)
  if (fetched.length) await store.addFiles(fetched, message.id)
}
</script>

<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
    <div v-if="!store.active?.messages.length" class="mx-auto flex max-w-2xl flex-col items-center px-4 pt-[10vh] text-center">
      <img :src="logoUrl" alt="kinolin" class="h-auto w-64 max-w-full" />
      <p class="mt-3 max-w-md text-sm leading-6 text-stone-500">
        用对话生成图片。确认卡片负责核对模型、比例和点数，图片上的工具负责裁剪、重绘、打光、扩图和抠图。
      </p>
      <div class="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
        <button
          v-for="item in SUGGESTIONS"
          :key="item.title"
          class="rounded-2xl border border-line bg-white px-4 py-3 transition hover:border-stone-300 hover:bg-[#faf8f5]"
          @click="store.send(item)"
        >
          <span class="block text-sm font-medium">{{ item.title }}</span>
          <span class="mt-1 line-clamp-2 block text-sm leading-5 text-stone-500">{{ item.text }}</span>
        </button>
      </div>
      <p class="mt-6 text-xs text-stone-400">输入 / 打开工具，输入 @ 引用已经生成的图片。当前画面是本地预览。</p>
    </div>

    <div v-else class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <article v-for="message in store.active.messages" :key="message.id" class="rise">
        <div v-if="message.role === 'user'" class="flex justify-end">
          <div class="max-w-[85%]">
            <div v-if="message.attachments.length" class="mb-2 flex justify-end gap-2">
              <span v-for="item in message.attachments" :key="item.id" class="group relative">
                <img :src="item.url" :alt="item.name" class="h-16 w-16 rounded-xl border border-line object-cover" />
                <button
                  v-if="editingId === message.id"
                  class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-xs text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                  :aria-label="`移除${item.name}`"
                  @click="store.removeMessageAttachment(message.id, item.id)"
                >
                  ×
                </button>
              </span>
            </div>
            <div v-if="editingId === message.id" class="w-[min(70vw,28rem)]">
              <textarea
                v-model="editText"
                rows="3"
                class="w-full rounded-[20px] border border-line bg-white px-4 py-2.5 text-sm leading-6 outline-none"
                placeholder="可粘贴图片"
                @paste="onEditPaste(message, $event)"
              />
              <div class="mt-2 flex justify-end gap-1">
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-full text-stone-500 hover:bg-sand"
                  aria-label="取消"
                  title="取消"
                  @click="editingId = null"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white disabled:opacity-30"
                  :disabled="!editText.trim() || store.busy"
                  aria-label="重新发送"
                  title="重新发送"
                  @click="submitEdit(message)"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 19V5" />
                    <path d="m6 11 6-6 6 6" />
                  </svg>
                </button>
              </div>
            </div>
            <template v-else>
              <div class="rounded-[20px] bg-[#ebe6dc] px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">{{ message.text }}</div>
              <div v-if="latestUserId === message.id" class="mt-1 flex justify-end">
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-full text-stone-500 hover:bg-sand disabled:opacity-30"
                  :disabled="store.busy"
                  aria-label="编辑"
                  title="编辑"
                  @click="startEdit(message)"
                >
                  <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="flex gap-3">
          <img :src="symbolUrl" alt="" class="h-8 w-8 shrink-0" />
          <div class="min-w-0 flex-1">
            <p v-if="message.text" class="pt-1 text-sm leading-6 whitespace-pre-wrap">{{ message.text }}</p>
            <span v-else class="inline-flex h-8 items-center gap-1" aria-label="正在整理">
              <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400" />
              <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400 [animation-delay:150ms]" />
              <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400 [animation-delay:300ms]" />
            </span>
            <ConfirmCard
              v-if="message.confirm"
              :spec="message.confirm"
              @approve="store.approve(message.id)"
              @cancel="store.cancelConfirm(message.id)"
              @patch="store.updateConfirm(message.id, $event)"
            />
            <div
              v-if="message.confirm?.status === 'generating' && !message.images.length"
              class="mt-3 grid gap-3"
              :class="columns(message.confirm.count)"
            >
              <div
                v-for="item in message.confirm.count"
                :key="item"
                class="animate-pulse rounded-2xl bg-sand"
                :style="{ aspectRatio: aspect(message.confirm.ratio, message.confirm.prompt) }"
              />
            </div>
            <div v-if="message.images.length" class="mt-3 grid gap-3" :class="columns(message.images.length)">
              <ImageTile v-for="image in message.images" :key="image.id" :image="image" :gallery="message.images" />
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
