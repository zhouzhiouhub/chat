<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import ConfirmCard from './ConfirmCard.vue'
import ImageTile from './ImageTile.vue'
import { ratioValue, resolveRatio, SUGGESTIONS } from '../lib/catalog'
import { useChat } from '../lib/store'
import type { AspectRatio } from '../types'

const store = useChat()
const scroller = ref<HTMLElement | null>(null)

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
</script>

<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
    <div v-if="!store.active?.messages.length" class="mx-auto flex max-w-2xl flex-col items-center px-4 pt-[10vh] text-center">
      <p class="font-serif text-4xl">绘话</p>
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
              <img
                v-for="item in message.attachments"
                :key="item.id"
                :src="item.url"
                :alt="item.name"
                class="h-16 w-16 rounded-xl border border-line object-cover"
              />
            </div>
            <div class="rounded-[20px] bg-[#ebe6dc] px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">{{ message.text }}</div>
          </div>
        </div>

        <div v-else class="flex gap-3">
          <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-sm text-white">绘</div>
          <div class="min-w-0 flex-1">
            <p v-if="message.text" class="text-sm leading-6 whitespace-pre-wrap">{{ message.text }}</p>
            <span v-else class="inline-flex gap-1 py-2" aria-label="正在整理">
              <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400" />
              <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400 [animation-delay:150ms]" />
              <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400 [animation-delay:300ms]" />
            </span>
            <ol v-if="message.plan.length" class="mt-3 space-y-1.5 text-sm text-stone-600">
              <li v-for="(step, index) in message.plan" :key="`${message.id}-${index}`" class="flex gap-2">
                <span class="mt-0.5 text-stone-400">{{ index + 1 }}</span>
                <span>{{ step }}</span>
              </li>
            </ol>
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
