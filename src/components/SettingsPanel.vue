<script setup lang="ts">
import { reactive, watch } from 'vue'
import { modelsForPlatform, PLATFORMS } from '../lib/catalog'
import { useChat } from '../lib/store'

const store = useChat()
const drafts = reactive<Record<string, { apiKey: string; baseUrl: string }>>({})
const savedId = reactive<{ id: string }>({ id: '' })

function sync() {
  savedId.id = ''
  for (const platform of PLATFORMS) {
    drafts[platform.id] = {
      apiKey: store.apiKey(platform.id),
      baseUrl: store.baseUrl(platform.id),
    }
  }
}

watch(
  () => store.settingsOpen,
  (open) => {
    if (open) sync()
  },
  { immediate: true },
)

function save(platformId: string) {
  const draft = drafts[platformId]
  if (!draft) return
  store.saveApi(platformId, draft.apiKey, draft.baseUrl)
  savedId.id = platformId
}

function clear(platformId: string) {
  store.clearApi(platformId)
  const platform = PLATFORMS.find((item) => item.id === platformId)
  drafts[platformId] = { apiKey: '', baseUrl: platform?.defaultBaseUrl ?? '' }
  savedId.id = ''
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-2xl px-4 py-6">
      <button class="text-sm text-stone-500 hover:text-ink" @click="store.closeSettings()">返回对话</button>
      <h2 class="mt-3 font-serif text-3xl">API 配置</h2>
      <p class="mt-2 text-sm leading-6 text-stone-500">
        每个平台使用内置模型，不需要填写模型名。保存密钥后，生成和改图会在已接入的模型里自动选择。密钥只保存在这台浏览器。
      </p>
      <p class="mt-3 text-sm">
        新图当前会使用
        <span class="font-medium">{{ store.modelFor('generate')?.name ?? '尚未接入的模型' }}</span>
      </p>

      <section v-for="platform in PLATFORMS" :key="platform.id" class="mt-5 rounded-2xl border border-line bg-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-medium">{{ platform.name }}</h3>
            <p class="mt-1 text-xs text-stone-500">{{ platform.hint }}</p>
          </div>
          <span
            class="rounded-full px-2 py-1 text-xs"
            :class="store.connectedIds.includes(platform.id) ? 'bg-[#e7f0e4] text-[#3f6212]' : 'bg-sand text-stone-500'"
          >
            {{ store.connectedIds.includes(platform.id) ? '已接入' : '未接入' }}
          </span>
        </div>

        <ul class="mt-3 flex flex-wrap gap-2">
          <li v-for="model in modelsForPlatform(platform.id)" :key="model.id" class="rounded-xl bg-sand px-2.5 py-1.5">
            <span class="block text-xs font-medium">{{ model.name }}</span>
            <span class="block text-[11px] text-stone-500">{{ model.apiModel }}</span>
          </li>
        </ul>

        <label class="mt-4 block text-sm">
          <span class="text-stone-500">{{ platform.keyLabel }}</span>
          <input
            v-model="drafts[platform.id].apiKey"
            class="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none"
            type="password"
            autocomplete="off"
            :placeholder="`填写 ${platform.name} 的密钥`"
          />
        </label>
        <label class="mt-3 block text-sm">
          <span class="text-stone-500">接口地址</span>
          <input v-model="drafts[platform.id].baseUrl" class="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none" type="url" />
        </label>
        <div class="mt-3 flex items-center gap-2">
          <button class="rounded-full bg-ink px-4 py-1.5 text-sm text-white" @click="save(platform.id)">保存</button>
          <button
            v-if="store.connectedIds.includes(platform.id)"
            class="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-sand"
            @click="clear(platform.id)"
          >
            清除
          </button>
          <span v-if="savedId.id === platform.id" class="text-xs text-stone-500">已保存</span>
        </div>
      </section>
    </div>
  </div>
</template>
