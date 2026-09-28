<script setup lang="ts">
import { reactive, watch } from 'vue'
import { modelsForPlatform, PLATFORMS } from '../lib/catalog'
import { useChat } from '../lib/store'

const store = useChat()
const drafts = reactive<Record<string, { apiKey: string; baseUrl: string; modelText: string }>>({})
const savedId = reactive<{ id: string }>({ id: '' })

function sync() {
  savedId.id = ''
  for (const platform of PLATFORMS) {
    drafts[platform.id] = {
      apiKey: store.apiKey(platform.id),
      baseUrl: store.baseUrl(platform.id),
      modelText: store.modelIds(platform.id).join('\n'),
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
  store.saveApi(platformId, draft.apiKey, draft.baseUrl, draft.modelText)
  savedId.id = platformId
}

function clear(platformId: string) {
  store.clearApi(platformId)
  const platform = PLATFORMS.find((item) => item.id === platformId)
  drafts[platformId] = { apiKey: '', baseUrl: platform?.defaultBaseUrl ?? '', modelText: '' }
  savedId.id = ''
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-2xl px-4 py-6">
      <button class="text-sm text-stone-500 hover:text-ink" @click="store.closeSettings()">返回对话</button>
      <h2 class="mt-3 font-serif text-3xl">API 配置</h2>
      <p class="mt-2 text-sm leading-6 text-stone-500">
        密钥只保存在这台浏览器。
      </p>

      <section v-for="platform in PLATFORMS" :key="platform.id" class="mt-5 rounded-2xl border border-line bg-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-medium">
              <a
                v-if="platform.site"
                :href="platform.site"
                class="underline decoration-stone-300 underline-offset-4 hover:decoration-ink"
                target="_blank"
                rel="noopener noreferrer"
              >{{ platform.name }}</a>
              <template v-else>{{ platform.name }}</template>
            </h3>
            <p class="mt-1 text-xs text-stone-500">{{ platform.hint }}</p>
          </div>
          <span
            class="rounded-full px-2 py-1 text-xs"
            :class="store.connectedIds.includes(platform.id) ? 'bg-[#e7f0e4] text-[#3f6212]' : 'bg-sand text-stone-500'"
          >
            {{ store.connectedIds.includes(platform.id) ? '已接入' : '未接入' }}
          </span>
        </div>

        <p v-if="platform.customModels && !modelsForPlatform(platform.id).length" class="mt-3 text-xs leading-5 text-stone-500">
          这个接口没有内置模型。在下面填写模型 ID，每行一个，保存后即可选用。
        </p>
        <ul v-else class="mt-3 flex flex-wrap gap-2">
          <li v-for="model in modelsForPlatform(platform.id)" :key="model.id" class="rounded-xl bg-sand px-2.5 py-1.5">
            <span class="block text-xs font-medium">{{ model.name }}</span>
            <span class="block text-[11px] text-stone-500">{{ model.kind === 'chat' ? '对话' : '图片' }} · {{ model.apiModel }}</span>
          </li>
        </ul>

        <label v-if="platform.customModels" class="mt-4 block text-sm">
          <span class="text-stone-500">模型 ID</span>
          <textarea
            v-model="drafts[platform.id].modelText"
            class="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none"
            placeholder="每行一个，例如 gpt-4o-mini"
          />
        </label>
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
          <input
            v-model="drafts[platform.id].baseUrl"
            class="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none"
            type="text"
            :placeholder="platform.customModels ? 'https://your-host/v1' : platform.defaultBaseUrl"
          />
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
