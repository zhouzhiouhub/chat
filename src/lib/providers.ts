import { getModel, platformOf, type ModelOption } from './catalog'
import type { Quality, Resolution, ToolId } from '../types'

export interface ImageRequest {
  modelId: string
  tool: ToolId
  prompt: string
  ratio: string
  resolution: Resolution
  count: number
  quality: Quality
  sourceUrl?: string
  referenceUrls?: string[]
  apiKey: string
  baseUrl: string
  signal?: AbortSignal
}

export type ImageJob = Omit<ImageRequest, 'apiKey' | 'baseUrl' | 'signal'>

const QUALITY_API: Record<Quality, string> = {
  低: 'low',
  中: 'medium',
  高: 'high',
  超高: 'xhigh',
  极致: 'max',
}

function endpoint(model: ModelOption, baseUrl: string, path: string): string {
  const normalized = baseUrl.replace(/\/$/, '')
  const official = platformOf(model.platformId).defaultBaseUrl.replace(/\/$/, '')
  if (normalized === official) return `/proxy/${model.platformId}${path}`
  return `${normalized}${path}`
}

function dataUrlParts(url: string): { mime: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mime: match[1], data: match[2] }
}

function dataUrlToBlob(url: string): Blob | null {
  const parts = dataUrlParts(url)
  if (!parts) return null
  const binary = atob(parts.data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: parts.mime })
}

function openaiSize(ratio: string, resolution: Resolution): string {
  const landscape = ratio === '16:9' || ratio === '3:2' || ratio === '4:3'
  const portrait = ratio === '9:16' || ratio === '2:3' || ratio === '3:4'
  if (resolution === '4K') {
    if (portrait) return '2160x3840'
    if (landscape) return '3840x2160'
    return '2048x2048'
  }
  if (resolution === '2K') {
    if (portrait) return '1152x2048'
    if (landscape) return '2048x1152'
    return '2048x2048'
  }
  if (portrait) return '1024x1536'
  if (landscape) return '1536x1024'
  return '1024x1024'
}

function taskPrompt(input: ImageRequest): string {
  const lines = [input.prompt.trim()]
  if (input.tool === 'grid') lines.push('输出一张 3×3 多机位九宫格，九格保持同一主体，只改变机位和景别。')
  if (input.tool === 'outpaint') lines.push(`把画面扩展为 ${input.ratio}，保留原图，并补全外侧区域。`)
  if (input.tool === 'redraw') lines.push('只修改说明中的区域，其余画面保持不变。')
  if (input.tool === 'erase') lines.push('去掉说明中的内容，并用周围画面自然补全。')
  if (input.tool === 'relight') lines.push('保持主体和构图，只调整光线、色温和轮廓光。')
  if (input.tool === 'angle') lines.push('保持主体身份，按说明更换观察角度。')
  if (input.tool === 'enhance') lines.push('提高清晰度和细节，不改变画面内容。')
  return lines.filter(Boolean).join('\n')
}

async function failureMessage(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const data = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    if (typeof data.error === 'string' && data.error) return data.error
    if (typeof data.error === 'object' && data.error?.message) return data.error.message
    if (data.message) return data.message
  } catch {
    // The provider returned plain text.
  }
  const brief = text.replace(/\s+/g, ' ').slice(0, 180)
  return brief || `请求失败（${response.status}）`
}

async function postJson(url: string, apiKey: string, body: unknown, signal?: AbortSignal, header: 'bearer' | 'google' = 'bearer'): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (header === 'google') headers['x-goog-api-key'] = apiKey
  else headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (!response.ok) throw new Error(await failureMessage(response))
  return response.json()
}

function imageInputs(input: ImageRequest): string[] {
  const urls = [input.sourceUrl, ...(input.referenceUrls ?? [])].filter((item): item is string => Boolean(item))
  return [...new Set(urls)].slice(0, 4)
}

async function openaiImage(input: ImageRequest, model: ModelOption): Promise<string> {
  const prompt = taskPrompt(input)
  const size = openaiSize(input.ratio, input.resolution)
  const images = imageInputs(input).map(dataUrlToBlob).filter((item): item is Blob => Boolean(item))
  if (images.length) {
    const form = new FormData()
    form.set('model', model.apiModel)
    form.set('prompt', prompt)
    form.set('size', size)
    if (model.qualities) form.set('quality', QUALITY_API[input.quality])
    images.forEach((image, index) => form.append(index === 0 ? 'image' : 'image[]', image, `ref-${index}.png`))
    const response = await fetch(endpoint(model, input.baseUrl, '/images/edits'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      signal: input.signal,
    })
    if (!response.ok) throw new Error(await failureMessage(response))
    return readB64(await response.json())
  }
  const body: Record<string, unknown> = { model: model.apiModel, prompt, size, n: 1 }
  if (model.qualities) body.quality = QUALITY_API[input.quality]
  return readB64(await postJson(endpoint(model, input.baseUrl, '/images/generations'), input.apiKey, body, input.signal))
}

async function volcengineImage(input: ImageRequest, model: ModelOption): Promise<string> {
  const body: Record<string, unknown> = {
    model: model.apiModel,
    prompt: taskPrompt(input),
    size: input.resolution,
    response_format: 'b64_json',
    watermark: false,
  }
  const images = imageInputs(input)
  if (images.length === 1) body.image = images[0]
  if (images.length > 1) body.image = images
  return readB64(await postJson(endpoint(model, input.baseUrl, '/images/generations'), input.apiKey, body, input.signal))
}

async function geminiImage(input: ImageRequest, model: ModelOption): Promise<string> {
  const parts: unknown[] = [{ text: taskPrompt(input) }]
  for (const url of imageInputs(input)) {
    const parsed = dataUrlParts(url)
    if (!parsed) continue
    parts.push({ inline_data: { mime_type: parsed.mime, data: parsed.data } })
  }
  const ratio = input.ratio === '自动' ? '1:1' : input.ratio
  const payload = await postJson(
    endpoint(model, input.baseUrl, `/models/${model.apiModel}:generateContent`),
    input.apiKey,
    {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        responseFormat: { image: { aspectRatio: ratio, imageSize: input.resolution } },
      },
    },
    input.signal,
    'google',
  )
  const data = payload as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }[] } }[]
  }
  const chunks = data.candidates?.[0]?.content?.parts ?? []
  for (const part of chunks) {
    const inline = part.inlineData ?? part.inline_data
    if (!inline?.data) continue
    const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png'
    return `data:${mime};base64,${inline.data}`
  }
  throw new Error('模型没有返回图片。')
}

function readB64(payload: unknown): string {
  const data = payload as { data?: { b64_json?: string; url?: string }[] }
  const image = data.data?.[0]
  if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`
  if (image?.url) return image.url
  throw new Error('模型没有返回图片。')
}

export async function requestProviderImages(input: ImageRequest): Promise<string[]> {
  const model = getModel(input.modelId)
  if (!input.apiKey.trim()) throw new Error(`请先在设置里接入${platformOf(model.platformId).name}。`)
  const total = Math.min(4, Math.max(1, input.count))
  const urls: string[] = []
  for (let index = 0; index < total; index += 1) {
    if (input.signal?.aborted) throw new Error('已停止。这次没有继续生成。')
    if (model.platformId === 'openai') urls.push(await openaiImage(input, model))
    else if (model.platformId === 'volcengine') urls.push(await volcengineImage(input, model))
    else urls.push(await geminiImage(input, model))
  }
  return urls
}
