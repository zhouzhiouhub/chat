<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { modelsForPlatform, PLATFORMS, uid } from '../lib/catalog'
import { useChat } from '../lib/store'

interface EndpointDraft {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  modelIds: string[]
}

const store = useChat()
const drafts = reactive<Record<string, { apiKey: string; baseUrl: string; modelText: string }>>({})
const endpointDrafts = ref<EndpointDraft[]>([])
const savedId = reactive<{ id: string }>({ id: '' })
const modelsShown = reactive<Record<string, boolean>>({})

function hideModels() {
  for (const platform of PLATFORMS) modelsShown[platform.id] = false
}

function blankEndpoint(): EndpointDraft {
  return { id: uid(), name: '', apiKey: '', baseUrl: '', modelIds: [''] }
}

function sync() {
  savedId.id = ''
  for (const platform of PLATFORMS) {
    drafts[platform.id] = {
      apiKey: store.apiKey(platform.id),
      baseUrl: store.baseUrl(platform.id),
      modelText: store.modelIds(platform.id).join('\n'),
    }
  }
  const saved = store.compatibleEndpoints()
  endpointDrafts.value = saved.length
    ? saved.map((item) => ({
        ...item,
        modelIds: item.modelIds.length ? [...item.modelIds] : [''],
      }))
    : [blankEndpoint()]
}

watch(
  () => store.settingsOpen,
  (open) => {
    if (!open) return
    sync()
    hideModels()
  },
  { immediate: true },
)

function save(platformId: string) {
  const draft = drafts[platformId]
  if (!draft) return
  store.saveApi(platformId, draft.apiKey, draft.baseUrl, draft.modelText)
  savedId.id = platformId
}

function saveCompatible() {
  store.saveCompatibleEndpoints(
    endpointDrafts.value.map((item) => ({
      ...item,
      modelIds: item.modelIds.map((modelId) => modelId.trim()).filter(Boolean),
    })),
  )
  savedId.id = 'compatible'
  const saved = store.compatibleEndpoints()
  endpointDrafts.value = saved.length
    ? saved.map((item) => ({
        ...item,
        modelIds: item.modelIds.length ? [...item.modelIds] : [''],
      }))
    : [blankEndpoint()]
}

function clear(platformId: string) {
  store.clearApi(platformId)
  const platform = PLATFORMS.find((item) => item.id === platformId)
  drafts[platformId] = { apiKey: '', baseUrl: platform?.defaultBaseUrl ?? '', modelText: '' }
  if (platformId === 'compatible') endpointDrafts.value = [blankEndpoint()]
  savedId.id = ''
}

function addEndpoint() {
  endpointDrafts.value.push(blankEndpoint())
}

function removeEndpoint(index: number) {
  if (endpointDrafts.value.length === 1) {
    endpointDrafts.value = [blankEndpoint()]
    return
  }
  endpointDrafts.value.splice(index, 1)
}

function addModel(endpoint: EndpointDraft) {
  endpoint.modelIds.push('')
}

function removeModel(endpoint: EndpointDraft, index: number) {
  if (endpoint.modelIds.length === 1) {
    endpoint.modelIds[0] = ''
    return
  }
  endpoint.modelIds.splice(index, 1)
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-2xl px-4 py-6">
      <h2 class="font-serif text-3xl">API 配置</h2>
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
              >{{ platform.siteName || platform.name }}</a>
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

        <template v-if="platform.customModels">
          <div v-for="(endpoint, index) in endpointDrafts" :key="endpoint.id" class="mt-4 rounded-xl border border-line p-3">
            <div class="flex items-center justify-between gap-3">
              <button class="text-xs text-stone-500 hover:text-ink" type="button" @click="removeEndpoint(index)">删除</button>
            </div>
            <label class="mt-3 block text-sm">
              <span class="text-stone-500">名称</span>
              <input
                v-model="endpoint.name"
                class="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none"
                type="text"
                placeholder="例如 Groq"
              />
            </label>
            <div class="mt-3">
              <span class="text-sm text-stone-500">模型 ID</span>
              <div v-for="(_, modelIndex) in endpoint.modelIds" :key="modelIndex" class="mt-1 flex items-center gap-2">
                <input
                  v-model="endpoint.modelIds[modelIndex]"
                  class="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none"
                  type="text"
                  placeholder="例如 gpt-4o-mini"
                />
                <button
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-sand"
                  type="button"
                  aria-label="删除模型"
                  @click="removeModel(endpoint, modelIndex)"
                >
                  ×
                </button>
              </div>
              <button class="mt-2 text-xs text-stone-500 hover:text-ink" type="button" @click="addModel(endpoint)">添加模型</button>
            </div>
            <label class="mt-3 block text-sm">
              <span class="text-stone-500">{{ platform.keyLabel }}</span>
              <input
                v-model="endpoint.apiKey"
                class="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none"
                type="password"
                autocomplete="off"
                placeholder="填写这个接口的密钥"
              />
            </label>
            <label class="mt-3 block text-sm">
              <span class="text-stone-500">接口地址</span>
              <input
                v-model="endpoint.baseUrl"
                class="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none"
                type="text"
                placeholder="https://your-host/v1"
              />
            </label>
          </div>
          <button class="mt-3 text-sm text-stone-500 hover:text-ink" type="button" @click="addEndpoint">添加接口</button>
          <div class="mt-3 flex items-center gap-2">
            <button class="rounded-full bg-ink px-4 py-1.5 text-sm text-white" type="button" @click="saveCompatible">保存</button>
            <button
              v-if="store.connectedIds.includes(platform.id)"
              class="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-sand"
              type="button"
              @click="clear(platform.id)"
            >
              清除
            </button>
            <span v-if="savedId.id === platform.id" class="text-xs text-stone-500">已保存</span>
          </div>
        </template>

        <template v-else>
          <button
            class="mt-3 text-xs text-stone-500 hover:text-ink"
            type="button"
            @click="modelsShown[platform.id] = !modelsShown[platform.id]"
          >
            {{ modelsShown[platform.id] ? '隐藏模型' : '显示模型' }}
          </button>
          <ul v-if="modelsShown[platform.id]" class="mt-3 flex flex-wrap gap-2">
            <li v-for="model in modelsForPlatform(platform.id)" :key="model.id" class="rounded-xl bg-sand px-2.5 py-1.5">
              <span class="block text-xs font-medium">{{ model.name }}</span>
              <span class="block text-[11px] text-stone-500">{{ model.kind === 'chat' ? '对话' : '图片' }} · {{ model.apiModel }}</span>
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
            <input
              v-model="drafts[platform.id].baseUrl"
              class="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none"
              type="text"
              :placeholder="platform.defaultBaseUrl"
            />
          </label>
          <div class="mt-3 flex items-center gap-2">
            <button class="rounded-full bg-ink px-4 py-1.5 text-sm text-white" type="button" @click="save(platform.id)">保存</button>
            <button
              v-if="store.connectedIds.includes(platform.id)"
              class="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-sand"
              type="button"
              @click="clear(platform.id)"
            >
              清除
            </button>
            <span v-if="savedId.id === platform.id" class="text-xs text-stone-500">已保存</span>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
