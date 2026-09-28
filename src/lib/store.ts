import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, type InjectionKey } from 'vue'
import {
  angleFromPrompt,
  countFromPrompt,
  enhanceFromPrompt,
  getModel,
  hasExplicitTarget,
  inferTool,
  isImagePrompt,
  modelsOfKind,
  lightFromPrompt,
  normalizeResolution,
  platformOf,
  PLATFORMS,
  setCompatibleModels,
  ratioFromPrompt,
  resolveRatio,
  roleLabel,
  splitFromPrompt,
  TOOL_META,
  uid,
  usesApi,
  type ModelOption,
  type Suggestion,
} from './catalog'
import { modelReturns200, requestChat, requestProviderImages, type ImageJob, type ImageRequest } from './providers'
import { composeImage, cropToRatio, cutoutImage, downscaleFile, resizeImage, sliceGrid } from './render'
import type {
  AspectRatio,
  Attachment,
  ConfirmSpec,
  Conversation,
  EditorState,
  ImageAsset,
  LightboxState,
  Message,
  Mode,
  Quality,
  ReferenceRole,
  Resolution,
  SplitSize,
  ToolId,
} from '../types'

export interface ChatStore {
  chats: Conversation[]
  activeId: string
  active: Conversation | null
  mode: Mode
  modelId: string
  ratio: AspectRatio
  resolution: Resolution
  count: number
  quality: Quality
  draft: string
  attachments: Attachment[]
  pendingTool: ToolId | null
  busy: boolean
  sidebarOpen: boolean
  editor: EditorState | null
  lightbox: LightboxState | null
  pulse: number
  setMode: (mode: Mode) => void
  newChat: () => void
  selectChat: (id: string) => void
  deleteChat: (id: string) => void
  send: (preset?: Suggestion) => Promise<void>
  resend: (messageId: string, text: string) => Promise<void>
  stop: () => void
  approve: (messageId: string) => Promise<void>
  cancelConfirm: (messageId: string) => void
  updateConfirm: (messageId: string, patch: Partial<ConfirmSpec>) => void
  addFiles: (files: File[]) => Promise<void>
  removeAttachment: (id: string) => void
  setAttachmentRole: (id: string, role: ReferenceRole) => void
  quoteImage: (image: ImageAsset) => void
  setPendingTool: (tool: ToolId | null) => void
  openEditor: (image: ImageAsset, tool: ToolId) => void
  closeEditor: () => void
  commitEdit: (payload: CommitEdit) => void
  openLightbox: (images: ImageAsset[], index: number) => void
  closeLightbox: () => void
  shiftLightbox: (step: number) => void
  settingsOpen: boolean
  connectedIds: string[]
  openSettings: () => void
  closeSettings: () => void
  apiKey: (platformId: string) => string
  baseUrl: (platformId: string) => string
  saveApi: (platformId: string, apiKey: string, baseUrl: string, modelIds?: string) => void
  clearApi: (platformId: string) => void
  modelIds: (platformId: string) => string[]
  pickReadyModel: (kind: 'chat' | 'image') => Promise<ModelOption | null>
  requestImages: (input: ImageJob) => Promise<string[]>
}

interface CommitEdit {
  urls: string[]
  prompt: string
  tool: ToolId
  modelId: string
  ratio: string
  resolution: string
  transparent?: boolean
  grid?: SplitSize | null
}

export const chatKey: InjectionKey<ChatStore> = Symbol('chat')

export function useChat(): ChatStore {
  const store = inject(chatKey)
  if (!store) throw new Error('缺少对话状态')
  return store
}

const STORAGE_KEY = 'huahua.v1'
const API_STORAGE_KEY = 'huahua.api.v1'

interface ApiConfig {
  apiKey: string
  baseUrl: string
  modelIds?: string[]
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function emptyChat(): Conversation {
  const now = Date.now()
  return { id: uid(), title: '新对话', createdAt: now, updatedAt: now, messages: [] }
}

function blankMessage(role: Message['role'], text = ''): Message {
  return { id: uid(), role, text, plan: [], attachments: [], confirm: null, images: [] }
}

function cleanModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 40)
}

function loadApi(): Record<string, ApiConfig> {
  try {
    const raw = localStorage.getItem(API_STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, ApiConfig>
    const configs: Record<string, ApiConfig> = {}
    for (const platform of PLATFORMS) {
      const item = data[platform.id]
      if (!item?.apiKey?.trim()) continue
      configs[platform.id] = {
        apiKey: item.apiKey.trim(),
        baseUrl: item.baseUrl?.trim() || platform.defaultBaseUrl,
        modelIds: platform.customModels ? cleanModelIds(item.modelIds) : undefined,
      }
    }
    return configs
  } catch {
    return {}
  }
}

function load(): {
  chats: Conversation[]
  activeId: string
  mode: Mode
  modelId: string
  ratio: AspectRatio
  resolution: Resolution
  count: number
  quality: Quality
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as {
      chats?: Conversation[]
      activeId?: string
      mode?: Mode
      modelId?: string
      ratio?: AspectRatio
      resolution?: Resolution
      count?: number
      quality?: Quality
      picker?: string
    }
    if (!Array.isArray(data.chats)) return null
    return {
      chats: data.chats.map((chat) => ({
        ...chat,
        messages: (chat.messages ?? []).map((message) => ({
          ...message,
          plan: message.plan ?? [],
          attachments: message.attachments ?? [],
          images: (message.images ?? []).filter((image) => image.url),
          confirm: message.confirm
            ? { ...message.confirm, referenceUrls: message.confirm.referenceUrls ?? [] }
            : null,
        })),
      })),
      activeId: data.activeId ?? '',
      mode: data.mode === 'auto' ? 'auto' : 'confirm',
      modelId: data.picker ?? 'auto',
      ratio: data.ratio ?? '1:1',
      resolution: data.resolution ?? '2K',
      count: data.count ?? 1,
      quality: data.quality ?? '高',
    }
  } catch {
    return null
  }
}

function imagesIn(chat: Conversation): ImageAsset[] {
  return chat.messages.flatMap((message) => message.images)
}

function mentioned(text: string, chat: Conversation): Attachment[] {
  const images = imagesIn(chat)
  const result: Attachment[] = []
  const regex = /@图片\s*(\d+)/g
  for (const match of text.matchAll(regex)) {
    const image = images.find((item) => item.label === `图片 ${match[1]}`)
    if (!image || result.some((item) => item.imageId === image.id)) continue
    result.push({
      id: uid(),
      name: image.label,
      url: image.url,
      role: 'style',
      imageId: image.id,
    })
  }
  return result
}

function resolveSource(
  chat: Conversation,
  refs: Attachment[],
): { url: string; label: string; imageId?: string } | null {
  const first = refs.find((item) => item.url)
  if (first) return { url: first.url, label: first.name, imageId: first.imageId }
  const last = [...imagesIn(chat)].reverse().find((item) => item.url)
  if (!last) return null
  return { url: last.url, label: last.label, imageId: last.id }
}

function needsSource(tool: ToolId): boolean {
  return tool !== 'generate' && tool !== 'grid'
}

function toolStep(tool: ToolId): string {
  switch (tool) {
    case 'redraw':
      return '按描述修改。没有涂抹区域时，会按整句提示出一张新版本'
    case 'relight':
      return '画面内容保持不变，只调整光的方向和氛围'
    case 'outpaint':
      return '保留原图，并补全扩展出去的区域'
    case 'erase':
      return '去掉描述里的内容，用周围画面补全'
    case 'cutout':
      return '识别主体并去掉背景，生成后需要检查边缘'
    case 'crop':
      return '没有手动画框时，按目标比例居中裁剪'
    case 'angle':
      return '按描述换一个观察角度，生成后检查结构和身份'
    case 'enhance':
      return '在原图上提高清晰度。文字和包装要放大检查'
    case 'resize':
      return '只改变像素尺寸，不重新生成画面'
    case 'split':
      return '按宫格拆成多张独立图片'
    case 'annotate':
      return '标注会留在图上，方便下一句说明改哪里'
    default:
      return TOOL_META[tool].hint
  }
}

function buildPlan(input: {
  tool: ToolId
  modelName: string
  ratioLabel: string
  resolution: Resolution
  count: number
  refs: Attachment[]
  sourceLabel?: string
  mode: Mode
}): string[] {
  const refLine = input.refs.length
    ? `参考：${input.refs.map((item) => `${item.name}（${roleLabel(item.role)}）`).join('、')}`
    : '没有附加参考图'
  const specLine = `${input.modelName} · ${input.ratioLabel} · ${input.resolution} · ${input.tool === 'grid' ? '九宫格' : `${input.count} 张`}`
  const gate = input.mode === 'auto' ? '自动生成：规格已经确定，直接开始' : '手动确认：核对卡片后再生成'
  if (input.tool === 'generate') return ['读取主体、环境、构图和风格', refLine, specLine, gate]
  if (input.tool === 'grid') {
    return [
      input.refs.length ? '按参考图锁定人物、服装和光线' : '没有参考图，按文字统一角色和光线',
      '先出一张 3×3 机位图，之后可以用快速切分拆开',
      specLine,
      gate,
    ]
  }
  return [input.sourceLabel ? `源图：${input.sourceLabel}。原图会保留` : '还没有可用的源图', toolStep(input.tool), specLine, gate]
}

function doneText(tool: ToolId): string {
  if (tool === 'grid') return '九宫格好了。要单独用某一格，点图片上的快速切分。'
  if (tool === 'cutout') return '抠图好了。头发、透明材质和复杂边缘建议打开大图检查。'
  if (tool === 'resize') return '尺寸已调整。预览最长边限制在 1600 像素，原图仍留在上面。'
  if (tool === 'crop' || tool === 'split' || tool === 'annotate') return '处理完成。原图还在上面，可以并排比较。'
  return '生成好了。打开大图检查主体、文字和边缘；要改局部，用图片上的重绘、打光或扩图。'
}

function sizeFromPrompt(prompt: string): { width: number; height: number } {
  const match = prompt.match(/(\d{2,4})\s*[x×*]\s*(\d{2,4})/i)
  if (!match) return { width: 1280, height: 720 }
  return { width: Number(match[1]), height: Number(match[2]) }
}

function asResolution(value: string): Resolution {
  if (value === '1K' || value === '2K' || value === '4K') return value
  return '2K'
}

function asRatio(value: string): AspectRatio {
  const ratios: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '自动']
  return ratios.includes(value as AspectRatio) ? (value as AspectRatio) : '1:1'
}

async function produce(spec: ConfirmSpec): Promise<string[]> {
  if (!spec.sourceUrl && needsSource(spec.tool)) throw new Error('缺少源图')
  if (spec.tool === 'split' && spec.sourceUrl) return sliceGrid(spec.sourceUrl, spec.split)
  if (spec.tool === 'crop' && spec.sourceUrl) return [await cropToRatio(spec.sourceUrl, resolveRatio(spec.ratio, spec.prompt))]
  if (spec.tool === 'resize' && spec.sourceUrl) {
    const size = sizeFromPrompt(spec.prompt)
    return [await resizeImage(spec.sourceUrl, size.width, size.height)]
  }
  if (spec.tool === 'cutout' && spec.sourceUrl) return [await cutoutImage(spec.sourceUrl)]
  if (spec.tool === 'annotate' && spec.sourceUrl) return [spec.sourceUrl]

  const total = spec.tool === 'grid' ? 1 : spec.count
  const ratioName = resolveRatio(spec.ratio, spec.prompt)
  const urls: string[] = []
  for (let index = 0; index < total; index += 1) {
    urls.push(
      await composeImage({
        prompt: spec.prompt,
        ratio: ratioName,
        seed: (Date.now() + index * 97) >>> 0,
        tool: spec.tool,
        sourceUrl: spec.sourceUrl,
        referenceUrls: spec.tool === 'generate' || spec.tool === 'grid' ? spec.referenceUrls : undefined,
        light: spec.tool === 'relight' ? lightFromPrompt(spec.prompt) : undefined,
        angle: spec.tool === 'angle' ? angleFromPrompt(spec.prompt) : undefined,
        enhance: spec.enhance,
        detail: spec.detail,
      }),
    )
  }
  return urls
}

export function createChatStore(): ChatStore {
  const saved = load()
  const chats = ref<Conversation[]>(saved?.chats.length ? saved.chats : [emptyChat()])
  let initialId = chats.value[0].id
  if (saved && chats.value.some((chat) => chat.id === saved.activeId)) initialId = saved.activeId
  const activeId = ref(initialId)
  const mode = ref<Mode>(saved?.mode ?? 'confirm')
  const modelId = ref(saved?.modelId ?? 'auto')
  const ratio = ref<AspectRatio>(saved?.ratio ?? '1:1')
  const resolution = ref<Resolution>(normalizeResolution(saved?.modelId && saved.modelId !== 'auto' ? saved.modelId : 'seedream', saved?.resolution ?? '2K'))
  const count = ref(saved?.count && saved.count >= 1 && saved.count <= 4 ? saved.count : 1)
  const quality = ref<Quality>(saved?.quality ?? '高')
  const draft = ref('')
  const attachments = ref<Attachment[]>([])
  const pendingTool = ref<ToolId | null>(null)
  const busy = ref(false)
  const sidebarOpen = ref(false)
  const editor = ref<EditorState | null>(null)
  const lightbox = ref<LightboxState | null>(null)
  const pulse = ref(0)
  const settingsOpen = ref(false)
  const apiConfigs = ref<Record<string, ApiConfig>>(loadApi())
  setCompatibleModels(apiConfigs.value.compatible?.modelIds ?? [])
  const connectedIds = computed(() =>
    PLATFORMS.filter((platform) => apiConfigs.value[platform.id]?.apiKey.trim()).map((platform) => platform.id),
  )
  let runToken = 0
  let requests = new AbortController()

  const active = computed(() => chats.value.find((chat) => chat.id === activeId.value) ?? null)

  function bump() {
    pulse.value += 1
  }

  function current(): Conversation {
    const found = chats.value.find((chat) => chat.id === activeId.value)
    if (found) return found
    const chat = emptyChat()
    chats.value.unshift(chat)
    activeId.value = chat.id
    return chat
  }

  function persist() {
    try {
      const payload = {
        chats: chats.value,
        activeId: activeId.value,
        mode: mode.value,
        modelId: modelId.value,
        ratio: ratio.value,
        resolution: resolution.value,
        count: count.value,
        quality: quality.value,
        picker: modelId.value,
      }
      let json = JSON.stringify(payload)
      if (json.length > 4_200_000) {
        json = JSON.stringify({
          ...payload,
          chats: payload.chats.slice(0, 6).map((chat) => ({
            ...chat,
            messages: chat.messages.map((message) => ({
              ...message,
              images: [],
              attachments: message.attachments.map((item) => ({ ...item, url: '' })),
              confirm: message.confirm ? { ...message.confirm, sourceUrl: undefined, referenceUrls: [] } : null,
            })),
          })),
        })
      }
      localStorage.setItem(STORAGE_KEY, json)
    } catch {
      // Keep the session in memory when storage is unavailable.
    }
  }

  async function ensureReady(model: ModelOption): Promise<boolean> {
    return modelReturns200(
      model,
      apiConfigs.value[model.platformId]?.apiKey ?? '',
      baseUrl(model.platformId),
      requests.signal,
    )
  }

  async function pickReadyModel(kind: 'chat' | 'image'): Promise<ModelOption | null> {
    for (const model of modelsOfKind(kind, connectedIds.value)) {
      if (requests.signal.aborted) return null
      if (await ensureReady(model)) return model
    }
    return null
  }

  function pickedModel(): ModelOption | null {
    if (modelId.value === 'auto') return null
    const model = getModel(modelId.value)
    if (model.id !== modelId.value || !connectedIds.value.includes(model.platformId)) return null
    return model
  }

  function specToRequest(spec: ConfirmSpec): ImageJob {
    return {
      modelId: spec.modelId,
      tool: spec.tool,
      prompt: spec.prompt,
      ratio: resolveRatio(spec.ratio, spec.prompt),
      resolution: spec.resolution,
      count: spec.tool === 'grid' ? 1 : spec.count,
      quality: spec.quality,
      sourceUrl: spec.sourceUrl,
      referenceUrls: spec.referenceUrls,
    }
  }

  async function requestImages(input: ImageJob): Promise<string[]> {
    const model = getModel(input.modelId)
    const request: ImageRequest = {
      ...input,
      apiKey: apiConfigs.value[model.platformId]?.apiKey ?? '',
      baseUrl: baseUrl(model.platformId),
      signal: requests.signal,
    }
    return requestProviderImages(request)
  }

  function baseUrl(platformId: string): string {
    return apiConfigs.value[platformId]?.baseUrl.trim() || platformOf(platformId).defaultBaseUrl
  }

  function persistApi() {
    try {
      localStorage.setItem(API_STORAGE_KEY, JSON.stringify(apiConfigs.value))
    } catch {
      // Keep the keys in memory when storage is unavailable.
    }
  }

  function findMessage(messageId: string): Message | null {
    for (const chat of chats.value) {
      const message = chat.messages.find((item) => item.id === messageId)
      if (message) return message
    }
    return null
  }

  async function reveal(message: Message, steps: string[], token: number): Promise<boolean> {
    for (const step of steps) {
      await wait(220)
      if (token !== runToken) return false
      message.plan.push(step)
      bump()
    }
    return true
  }

  async function runGeneration(message: Message, token: number) {
    const spec = message.confirm
    if (!spec) return
    spec.status = 'generating'
    bump()
    if (!usesApi(spec.tool)) await wait(720 + spec.count * 160)
    if (token !== runToken) return
    try {
      const urls = usesApi(spec.tool) ? await requestImages(specToRequest(spec)) : await produce(spec)
      if (token !== runToken) return
      const chat = current()
      const model = getModel(spec.modelId)
      const start = imagesIn(chat).length
      const ratioLabel = resolveRatio(spec.ratio, spec.prompt)
      message.images = urls.map((url, index) => ({
        id: uid(),
        url,
        prompt: spec.prompt,
        modelId: spec.modelId,
        modelName: model.name,
        ratio: ratioLabel,
        resolution: spec.tool === 'resize' ? `${sizeFromPrompt(spec.prompt).width}×${sizeFromPrompt(spec.prompt).height}` : spec.resolution,
        tool: spec.tool,
        label: `图片 ${start + index + 1}`,
        parentId: spec.sourceImageId,
        transparent: spec.tool === 'cutout',
        grid: spec.tool === 'grid' ? 3 : null,
      }))
      spec.status = 'done'
      spec.summary =
        spec.tool === 'resize'
          ? `调整像素 · ${message.images[0]?.resolution ?? ''}`
          : `${TOOL_META[spec.tool].label} · ${model.name} · ${ratioLabel} · ${urls.length} 张`
      message.text = doneText(spec.tool)
    } catch (error) {
      spec.status = 'cancelled'
      message.text = error instanceof Error ? error.message : '这次生成没有完成，请再试一次。'
    }
    bump()
  }

  function openEditorFrom(
    tool: ToolId,
    source: { url: string; label: string; imageId?: string },
    prompt: string,
    chat: Conversation,
  ) {
    const image = source.imageId ? imagesIn(chat).find((item) => item.id === source.imageId) : undefined
    editor.value = {
      tool,
      prompt,
      sourceUrl: source.url,
      sourceLabel: source.label,
      parentImageId: source.imageId,
      transparent: image?.transparent,
      grid: image?.grid,
    }
  }

  async function send(preset?: Suggestion) {
    if (busy.value) return
    const text = (preset?.text ?? draft.value).trim()
    const toolChip = preset ? null : pendingTool.value
    const own = preset ? [] : attachments.value.map((item) => ({ ...item }))
    if (preset) {
      ratio.value = preset.ratio
      count.value = preset.count
      resolution.value = preset.resolution
    }
    if (!text && own.length === 0 && !toolChip) return

    const chat = current()
    const refs = [...own]
    for (const item of mentioned(text, chat)) {
      if (!refs.some((ref) => ref.url === item.url)) refs.push(item)
    }
    const tool = toolChip ?? inferTool(text, refs.length > 0 || hasExplicitTarget(text))
    if (toolChip && TOOL_META[toolChip].spatial) {
      const source = resolveSource(chat, refs)
      if (source) {
        draft.value = ''
        attachments.value = []
        pendingTool.value = null
        openEditorFrom(toolChip, source, text, chat)
        return
      }
    }

    const finalText = text || `${TOOL_META[tool].label}这张图片`
    const promptedRatio = ratioFromPrompt(finalText)
    if (promptedRatio) ratio.value = promptedRatio
    const promptedCount = countFromPrompt(finalText)
    if (promptedCount) count.value = promptedCount

    draft.value = ''
    attachments.value = []
    pendingTool.value = null

    if (chat.title === '新对话') chat.title = finalText.replace(/\s+/g, ' ').slice(0, 22)
    chat.updatedAt = Date.now()

    const user = blankMessage('user', finalText)
    user.attachments = refs
    chat.messages.push(user, blankMessage('assistant'))
    const assistant = chat.messages[chat.messages.length - 1]
    bump()
    await runTurn(chat, assistant, finalText, refs, tool)
  }

  async function resend(messageId: string, text: string) {
    if (busy.value) return
    const next = text.trim()
    if (!next) return
    const chat = current()
    const index = chat.messages.findIndex((item) => item.id === messageId && item.role === 'user')
    if (index < 0 || chat.messages.slice(index + 1).some((item) => item.role === 'user')) return
    const user = chat.messages[index]
    user.text = next
    chat.messages.splice(index + 1)
    const refs = user.attachments.filter((item) => item.url)
    for (const item of mentioned(next, chat)) {
      if (!refs.some((ref) => ref.url === item.url)) refs.push(item)
    }
    user.attachments = refs
    const first = chat.messages.find((item) => item.role === 'user')
    if (first?.id === user.id) chat.title = next.replace(/\s+/g, ' ').slice(0, 22) || '新对话'
    chat.updatedAt = Date.now()
    const tool = inferTool(next, refs.length > 0 || hasExplicitTarget(next))
    chat.messages.push(blankMessage('assistant'))
    const assistant = chat.messages[chat.messages.length - 1]
    bump()
    await runTurn(chat, assistant, next, refs, tool)
  }

  async function runTurn(chat: Conversation, assistant: Message, finalText: string, refs: Attachment[], tool: ToolId) {
    const my = ++runToken
    busy.value = true
    const source = needsSource(tool) ? resolveSource(chat, refs) : null
    const missing = needsSource(tool) && !source
    try {
      if (missing) {
        assistant.text = '这个操作需要一张源图。上传图片，或输入 @ 选择已经生成的图片，并说明它是产品、角色、构图、风格还是光线参考。'
        return
      }
      if (tool === 'annotate' && source) {
        assistant.text = `要标注「${source.label}」，请点开图片使用标注工具圈出区域，并写明这块是要修改还是保留。`
        return
      }
      const selected = pickedModel()
      const plainChat = tool === 'generate' && (selected ? selected.kind === 'chat' : !isImagePrompt(finalText))
      if (plainChat) {
        let model = selected?.kind === 'chat' ? selected : null
        if (model) {
          assistant.plan = [`正在确认 ${model.name} 是否返回 200`]
          bump()
          if (!(await ensureReady(model))) {
            if (my !== runToken) return
            assistant.text = `${model.name} 没有返回 200，这次没有继续请求。`
            return
          }
        } else {
          assistant.plan = ['正在逐个检测对话模型，只使用返回 200 的接口']
          bump()
          model = await pickReadyModel('chat')
          if (my !== runToken) return
          if (!model) {
            assistant.text = '已接入的对话模型都没有返回 200。请检查密钥，或在输入框里改选一个模型。'
            return
          }
        }
        assistant.plan = [`${model.name}（${platformOf(model.platformId).name}${selected ? '' : '，自动选择'}）`]
        try {
          const history = chat.messages
            .filter((item) => item.id !== assistant.id && item.text.trim())
            .slice(-16)
            .map((item) => ({ role: item.role, content: item.text }))
          assistant.text = await requestChat({
            modelId: model.id,
            messages: history,
            apiKey: apiConfigs.value[model.platformId]?.apiKey ?? '',
            baseUrl: baseUrl(model.platformId),
            signal: requests.signal,
          })
        } catch (error) {
          if (my !== runToken) return
          assistant.text = error instanceof Error ? error.message : '这次没有回复。'
        }
        return
      }
      if (usesApi(tool) && selected?.kind === 'chat') {
        assistant.text = '当前选的是对话模型，这个操作需要图片模型。请改成自动，或另选一个图片模型。'
        return
      }
      let imageModel = selected?.kind === 'image' ? selected : null
      if (usesApi(tool) && imageModel) {
        assistant.plan = [`正在确认 ${imageModel.name} 是否返回 200`]
        bump()
        if (!(await ensureReady(imageModel))) {
          if (my !== runToken) return
          assistant.text = `${imageModel.name} 没有返回 200，这次没有继续请求。`
          return
        }
      } else if (usesApi(tool)) {
        assistant.plan = ['正在逐个检测图片模型，只使用返回 200 的接口']
        bump()
        imageModel = await pickReadyModel('image')
        if (my !== runToken) return
        if (!imageModel) {
          assistant.text = '已接入的图片模型都没有返回 200。请检查密钥，或在输入框里改选一个模型。'
          return
        }
      }
      const shownModel = imageModel ?? getModel('seedream')
      if (imageModel) resolution.value = normalizeResolution(imageModel.id, resolution.value)
      assistant.text =
        mode.value === 'auto'
          ? '我按当前规格直接生成。新结果留在这条对话里，原来的图片不会被覆盖。'
          : tool === 'generate' || tool === 'grid'
            ? '我先把模型、比例和参考用途放进确认卡片。核对后再生成。'
            : `这次按「${TOOL_META[tool].label}」处理。可以在卡片里改模型和参数，确认后才会开始。`
      const ratioLabel = resolveRatio(ratio.value, finalText)
      const alive = await reveal(
        assistant,
        buildPlan({
          tool,
          modelName: `${shownModel.name}（${platformOf(shownModel.platformId).name}，${selected ? '手动选择' : '自动选择'}）`,
          ratioLabel,
          resolution: resolution.value,
          count: tool === 'grid' ? 1 : count.value,
          refs,
          sourceLabel: source?.label,
          mode: mode.value,
        }),
        my,
      )
      if (!alive) return
      const spec: ConfirmSpec = {
        status: mode.value === 'auto' ? 'generating' : 'pending',
        tool,
        prompt: finalText,
        modelId: shownModel.id,
        ratio: ratio.value,
        resolution: resolution.value,
        count: tool === 'grid' || tool === 'split' || tool === 'crop' || tool === 'resize' || tool === 'cutout' ? 1 : count.value,
        quality: quality.value,
        detail: '中',
        enhance: enhanceFromPrompt(finalText),
        split: splitFromPrompt(finalText),
        references: refs.map((item) => ({ name: item.name, role: item.role })),
        referenceUrls: refs.map((item) => item.url),
        sourceUrl: source?.url,
        sourceLabel: source?.label,
        sourceImageId: source?.imageId,
        summary: '',
      }
      assistant.confirm = spec
      bump()
      if (mode.value === 'auto') await runGeneration(assistant, my)
    } finally {
      if (my === runToken) busy.value = false
      persist()
    }
  }

  function stop() {
    runToken += 1
    requests.abort()
    requests = new AbortController()
    busy.value = false
    const chat = chats.value.find((item) => item.id === activeId.value)
    const last = [...(chat?.messages ?? [])].reverse().find((message) => message.role === 'assistant')
    if (!last) return
    if (last.confirm && last.confirm.status !== 'done') last.confirm.status = 'cancelled'
    if (!last.images.length) last.text = '已停止。这次没有继续生成。'
    bump()
    persist()
  }

  async function approve(messageId: string) {
    if (busy.value) return
    const message = findMessage(messageId)
    if (!message?.confirm || message.confirm.status !== 'pending') return
    const my = ++runToken
    busy.value = true
    try {
      await runGeneration(message, my)
    } finally {
      if (my === runToken) busy.value = false
      persist()
    }
  }

  function cancelConfirm(messageId: string) {
    const message = findMessage(messageId)
    if (!message?.confirm || message.confirm.status !== 'pending') return
    message.confirm.status = 'cancelled'
    message.text = '已取消。这次不会开始生成。'
    bump()
    persist()
  }

  function updateConfirm(messageId: string, patch: Partial<ConfirmSpec>) {
    const message = findMessage(messageId)
    if (!message?.confirm || message.confirm.status !== 'pending') return
    Object.assign(message.confirm, patch)
    if (patch.modelId) modelId.value = patch.modelId
    message.confirm.resolution = normalizeResolution(message.confirm.modelId, message.confirm.resolution)
    message.confirm.count = Math.min(4, Math.max(1, message.confirm.count))
    bump()
  }

  async function addFiles(files: File[]) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        const url = await downscaleFile(file)
        attachments.value.push({
          id: uid(),
          name: file.name.replace(/\.[^.]+$/, '') || '参考图',
          url,
          role: attachments.value.length === 0 ? 'product' : 'style',
        })
      } catch {
        // Skip files that cannot be decoded.
      }
    }
  }

  function commitEdit(payload: CommitEdit) {
    const source = editor.value
    if (!source) return
    const chat = current()
    const user = blankMessage('user', payload.prompt.trim() || TOOL_META[payload.tool].label)
    user.attachments = [
      {
        id: uid(),
        name: source.sourceLabel,
        url: source.sourceUrl,
        role: 'composition',
        imageId: source.parentImageId,
      },
    ]
    const assistant = blankMessage('assistant', doneText(payload.tool))
    const model = getModel(payload.modelId)
    const start = imagesIn(chat).length
    assistant.images = payload.urls.map((url, index) => ({
      id: uid(),
      url,
      prompt: payload.prompt,
      modelId: payload.modelId,
      modelName: model.name,
      ratio: payload.ratio,
      resolution: payload.resolution,
      tool: payload.tool,
      label: `图片 ${start + index + 1}`,
      parentId: source.parentImageId,
      transparent: payload.transparent,
      grid: payload.grid ?? null,
    }))
    assistant.confirm = {
      status: 'done',
      tool: payload.tool,
      prompt: payload.prompt,
      modelId: payload.modelId,
      ratio: asRatio(payload.ratio),
      resolution: asResolution(payload.resolution),
      count: payload.urls.length,
      quality: quality.value,
      detail: '中',
      enhance: 'clarity',
      split: 3,
      references: [{ name: source.sourceLabel, role: 'composition' }],
      referenceUrls: [],
      sourceUrl: source.sourceUrl,
      sourceLabel: source.sourceLabel,
      sourceImageId: source.parentImageId,
      summary: `${TOOL_META[payload.tool].label} · ${model.name} · ${payload.ratio} · ${payload.urls.length} 张`,
    }
    if (chat.title === '新对话') chat.title = user.text.slice(0, 22)
    chat.updatedAt = Date.now()
    chat.messages.push(user, assistant)
    editor.value = null
    bump()
    persist()
  }

  function onKey(event: KeyboardEvent) {
    const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement
    if (event.key === 'Escape' && !typing) {
      if (lightbox.value) lightbox.value = null
      else if (editor.value) editor.value = null
    }
    if (!lightbox.value) return
    if (event.key === 'ArrowRight') shiftLightbox(1)
    if (event.key === 'ArrowLeft') shiftLightbox(-1)
  }

  function shiftLightbox(step: number) {
    if (!lightbox.value) return
    const total = lightbox.value.images.length
    lightbox.value = { ...lightbox.value, index: (lightbox.value.index + step + total) % total }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

  const store = reactive({
    chats,
    activeId,
    active,
    mode,
    modelId,
    ratio,
    resolution,
    count,
    quality,
    draft,
    attachments,
    pendingTool,
    busy,
    sidebarOpen,
    editor,
    lightbox,
    pulse,
    setMode(next: Mode) {
      mode.value = next
      persist()
    },
    newChat() {
      const currentChat = chats.value.find((chat) => chat.id === activeId.value)
      if (currentChat && currentChat.messages.length === 0) {
        sidebarOpen.value = false
        return
      }
      const chat = emptyChat()
      chats.value.unshift(chat)
      activeId.value = chat.id
      draft.value = ''
      attachments.value = []
      pendingTool.value = null
      sidebarOpen.value = false
      persist()
    },
    selectChat(id: string) {
      activeId.value = id
      sidebarOpen.value = false
      persist()
    },
    deleteChat(id: string) {
      const next = chats.value.filter((chat) => chat.id !== id)
      chats.value = next.length ? next : [emptyChat()]
      if (!chats.value.some((chat) => chat.id === activeId.value)) activeId.value = chats.value[0].id
      persist()
    },
    send,
    resend,
    stop,
    approve,
    cancelConfirm,
    updateConfirm,
    addFiles,
    removeAttachment(id: string) {
      attachments.value = attachments.value.filter((item) => item.id !== id)
    },
    setAttachmentRole(id: string, role: ReferenceRole) {
      const item = attachments.value.find((attachment) => attachment.id === id)
      if (item) item.role = role
    },
    quoteImage(image: ImageAsset) {
      if (attachments.value.some((item) => item.imageId === image.id)) return
      attachments.value.push({
        id: uid(),
        name: image.label,
        url: image.url,
        role: 'style',
        imageId: image.id,
      })
    },
    setPendingTool(tool: ToolId | null) {
      pendingTool.value = tool
    },
    openEditor(image: ImageAsset, tool: ToolId) {
      editor.value = {
        tool,
        prompt: '',
        sourceUrl: image.url,
        sourceLabel: image.label,
        parentImageId: image.id,
        transparent: image.transparent,
        grid: image.grid,
      }
    },
    closeEditor() {
      editor.value = null
    },
    commitEdit,
    openLightbox(images: ImageAsset[], index: number) {
      const usable = images.filter((image) => image.url)
      if (!usable.length) return
      lightbox.value = { images: usable, index: Math.min(index, usable.length - 1) }
    },
    closeLightbox() {
      lightbox.value = null
    },
    shiftLightbox,
    settingsOpen,
    connectedIds,
    openSettings() {
      settingsOpen.value = true
      sidebarOpen.value = false
    },
    closeSettings() {
      settingsOpen.value = false
    },
    apiKey(platformId: string) {
      return apiConfigs.value[platformId]?.apiKey ?? ''
    },
    baseUrl,
    saveApi(platformId: string, key: string, url: string, modelText = '') {
      const next = { ...apiConfigs.value }
      const apiKey = key.trim()
      if (!apiKey) delete next[platformId]
      else {
        const platform = platformOf(platformId)
        next[platformId] = {
          apiKey,
          baseUrl: url.trim() || platform.defaultBaseUrl,
          modelIds: platform.customModels ? cleanModelIds(modelText.split(/[\n,]/)) : undefined,
        }
      }
      apiConfigs.value = next
      setCompatibleModels(next.compatible?.modelIds ?? [])
      persistApi()
    },
    clearApi(platformId: string) {
      const next = { ...apiConfigs.value }
      delete next[platformId]
      apiConfigs.value = next
      setCompatibleModels(next.compatible?.modelIds ?? [])
      persistApi()
    },
    modelIds(platformId: string) {
      return apiConfigs.value[platformId]?.modelIds ?? []
    },
    pickReadyModel,
    requestImages,
  })
  return store as ChatStore
}
