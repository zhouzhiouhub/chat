import type {
  AspectRatio,
  Detail,
  EnhanceMode,
  Quality,
  ReferenceRole,
  Resolution,
  SplitSize,
  ToolId,
} from '../types'

export interface ModelOption {
  id: string
  name: string
  resolutions: Resolution[]
  qualities: Quality[] | null
  credit: number
}

export const MODELS: ModelOption[] = [
  {
    id: 'seedream',
    name: 'Seedream 5.0 Pro',
    resolutions: ['1K', '2K'],
    qualities: null,
    credit: 8,
  },
  {
    id: 'banana',
    name: 'Banana Pro',
    resolutions: ['1K', '2K', '4K'],
    qualities: null,
    credit: 10,
  },
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    resolutions: ['1K', '2K', '4K'],
    qualities: null,
    credit: 14,
  },
  {
    id: 'flare',
    name: 'GPT Image 2.5 Flare',
    resolutions: ['1K', '2K', '4K'],
    qualities: ['低', '中', '高', '超高', '极致'],
    credit: 18,
  },
  {
    id: 'sunburst',
    name: 'GPT Image 2.5 Sunburst',
    resolutions: ['1K', '2K', '4K'],
    qualities: ['低', '中', '高', '超高', '极致'],
    credit: 18,
  },
]

export const RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '自动']

export const FRAME_RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']

export const ROLES: { id: ReferenceRole; label: string }[] = [
  { id: 'product', label: '产品' },
  { id: 'character', label: '角色' },
  { id: 'composition', label: '构图' },
  { id: 'style', label: '风格' },
  { id: 'light', label: '光线' },
]

export const QUALITIES: Quality[] = ['低', '中', '高', '超高', '极致']

export const DETAILS: Detail[] = ['低', '中', '高']

export interface ToolMeta {
  label: string
  generative: boolean
  spatial: boolean
  hint: string
}

export const TOOL_META: Record<ToolId, ToolMeta> = {
  generate: {
    label: '生成图片',
    generative: true,
    spatial: false,
    hint: '按描述生成新图片',
  },
  grid: {
    label: '多机位九宫格',
    generative: true,
    spatial: false,
    hint: '同一画面的 3×3 机位',
  },
  crop: {
    label: '裁剪',
    generative: false,
    spatial: true,
    hint: '重新确定画面范围',
  },
  angle: {
    label: '多角度',
    generative: true,
    spatial: true,
    hint: '换一个观察角度',
  },
  redraw: {
    label: '重绘',
    generative: true,
    spatial: true,
    hint: '只改涂出的区域',
  },
  relight: {
    label: '打光',
    generative: true,
    spatial: true,
    hint: '调整光源、色温和轮廓光',
  },
  outpaint: {
    label: '扩图',
    generative: true,
    spatial: true,
    hint: '延伸边界并补全画面',
  },
  erase: {
    label: '擦除',
    generative: true,
    spatial: true,
    hint: '去掉涂出的内容并补全',
  },
  annotate: {
    label: '标注',
    generative: false,
    spatial: true,
    hint: '圈出要修改或保留的位置',
  },
  enhance: {
    label: '增强',
    generative: true,
    spatial: true,
    hint: '清晰度增强或高清放大',
  },
  resize: {
    label: '调整像素',
    generative: false,
    spatial: true,
    hint: '改成指定宽高',
  },
  cutout: {
    label: '抠图',
    generative: true,
    spatial: true,
    hint: '保留主体并去掉背景',
  },
  split: {
    label: '快速切分',
    generative: false,
    spatial: true,
    hint: '把宫格拆成单独图片',
  },
}

export interface SlashCommand {
  tool: ToolId
  slash: string
  label: string
  hint: string
}

export const COMMANDS: SlashCommand[] = [
  { tool: 'grid', slash: '九宫格', label: '多机位九宫格', hint: '生成 3×3 机位，可用切分拆开' },
  { tool: 'redraw', slash: '重绘', label: '重绘', hint: '涂出区域，写清要改成什么' },
  { tool: 'relight', slash: '打光', label: '打光', hint: '选择主光方向、亮度和色温' },
  { tool: 'outpaint', slash: '扩图', label: '扩图', hint: '选择目标比例，补全新增区域' },
  { tool: 'erase', slash: '擦除', label: '擦除', hint: '涂掉一块内容，按周围画面补全' },
  { tool: 'cutout', slash: '抠图', label: '抠图', hint: '识别主体并移除背景' },
  { tool: 'enhance', slash: '增强', label: '增强', hint: '清晰度增强，或放大尺寸' },
  { tool: 'angle', slash: '多角度', label: '多角度', hint: '调整旋转、倾斜、远近和广角' },
  { tool: 'crop', slash: '裁剪', label: '裁剪', hint: '拖动裁剪框或选择比例' },
  { tool: 'annotate', slash: '标注', label: '标注', hint: '圈出重点，交给后续对话参考' },
  { tool: 'resize', slash: '像素', label: '调整像素', hint: '输入目标宽度和高度' },
  { tool: 'split', slash: '切分', label: '快速切分', hint: '按 2×2、3×3 或 4×4 拆开' },
]

export const PRIMARY_TOOLS: ToolId[] = ['crop', 'angle', 'redraw', 'relight']

export const MORE_TOOLS: ToolId[] = [
  'outpaint',
  'erase',
  'annotate',
  'enhance',
  'resize',
  'cutout',
  'split',
]

export interface Suggestion {
  title: string
  text: string
  ratio: AspectRatio
  count: number
  resolution: Resolution
}

export const SUGGESTIONS: Suggestion[] = [
  {
    title: '竖版产品主视觉',
    text: '为护肤精华制作一张竖版产品主视觉。瓶身居中偏下，深蓝背景，顶部有柔和冷光，周围保留少量水雾。9:16，画面上方留出标题空间。',
    ratio: '9:16',
    count: 2,
    resolution: '2K',
  },
  {
    title: '雨夜街景',
    text: '一张 16:9 的电影感街景。雨夜，霓虹反射在湿润路面上，一位穿深色大衣的人走向远处的暖色橱窗。',
    ratio: '16:9',
    count: 1,
    resolution: '2K',
  },
  {
    title: '角色多机位九宫格',
    text: '多机位九宫格：年轻女性，短发，米白色外套，站在浅灰工作室背景前。九个画面保持五官、服装和光线一致，只改变机位和景别。',
    ratio: '1:1',
    count: 1,
    resolution: '2K',
  },
  {
    title: '大理石台面静物',
    text: '清晨的大理石台面上，一只玻璃精华瓶偏左放置，窗边侧光，浅色亚麻布作背景，4:3，保留瓶身高光和桌面投影。',
    ratio: '4:3',
    count: 1,
    resolution: '2K',
  },
]

const RES_MULT: Record<Resolution, number> = { '1K': 1, '2K': 1.6, '4K': 2.8 }
const QUAL_MULT: Record<Quality, number> = { 低: 0.6, 中: 1, 高: 1.4, 超高: 2, 极致: 2.8 }
const DETAIL_MULT: Record<Detail, number> = { 低: 0.8, 中: 1, 高: 1.5 }

export function getModel(id: string): ModelOption {
  return MODELS.find((item) => item.id === id) ?? MODELS[0]
}

export function roleLabel(role: ReferenceRole): string {
  return ROLES.find((item) => item.id === role)?.label ?? '参考'
}

export function estimateCredits(input: {
  tool: ToolId
  modelId: string
  resolution: Resolution
  count: number
  quality: Quality
  detail: Detail
}): number {
  if (!TOOL_META[input.tool].generative) return 0
  const model = getModel(input.modelId)
  let value = model.credit * RES_MULT[input.resolution] * Math.max(1, input.count)
  if (model.qualities) value *= QUAL_MULT[input.quality]
  if (input.tool === 'outpaint') value *= DETAIL_MULT[input.detail]
  if (input.tool === 'grid') value *= 1.8
  return Math.max(1, Math.round(value))
}

export function normalizeResolution(modelId: string, resolution: Resolution): Resolution {
  const model = getModel(modelId)
  if (model.resolutions.includes(resolution)) return resolution
  return model.resolutions[model.resolutions.length - 1]
}

export function ratioValue(ratio: string): [number, number] {
  const map: Record<string, [number, number]> = {
    '1:1': [1, 1],
    '16:9': [16, 9],
    '9:16': [9, 16],
    '4:3': [4, 3],
    '3:4': [3, 4],
    '3:2': [3, 2],
    '2:3': [2, 3],
  }
  return map[ratio] ?? [1, 1]
}

export function resolveRatio(ratio: AspectRatio, prompt: string): Exclude<AspectRatio, '自动'> {
  if (ratio !== '自动') return ratio
  if (/竖|9:16|海报/.test(prompt)) return '9:16'
  if (/横|16:9|宽银幕/.test(prompt)) return '16:9'
  if (/4:3/.test(prompt)) return '4:3'
  return '1:1'
}

export function ratioFromPrompt(prompt: string): AspectRatio | null {
  const match = prompt.match(/1:1|16:9|9:16|4:3|3:4|3:2|2:3/)
  return (match?.[0] as AspectRatio | undefined) ?? null
}

export function countFromPrompt(prompt: string): number | null {
  const match = prompt.match(/([1-4])\s*张/)
  if (!match) return null
  return Number(match[1])
}

export function splitFromPrompt(prompt: string): SplitSize {
  if (/2\s*[×x]\s*2/.test(prompt)) return 2
  if (/4\s*[×x]\s*4/.test(prompt)) return 4
  return 3
}

export function enhanceFromPrompt(prompt: string): EnhanceMode {
  if (/放大|高清放大|4K|超分/.test(prompt)) return 'upscale'
  return 'clarity'
}

export function inferTool(prompt: string, hasTarget: boolean): ToolId {
  if (/九宫格|多机位/.test(prompt)) return 'grid'
  if (!hasTarget) return 'generate'
  if (/抠图|去背|去掉背景|透明背景/.test(prompt)) return 'cutout'
  if (/扩图|延伸画面|向外扩展/.test(prompt)) return 'outpaint'
  if (/重绘|局部修改|涂抹/.test(prompt)) return 'redraw'
  if (/擦除|擦掉|移除/.test(prompt)) return 'erase'
  if (/打光|色温|轮廓光/.test(prompt)) return 'relight'
  if (/多角度|换个角度|换一个角度/.test(prompt)) return 'angle'
  if (/裁剪|裁成|重新取景/.test(prompt)) return 'crop'
  if (/增强|变清晰|高清/.test(prompt)) return 'enhance'
  if (/切分|拆成|宫格拆/.test(prompt)) return 'split'
  if (/调整像素|宽高|像素/.test(prompt)) return 'resize'
  if (/标注|圈出/.test(prompt)) return 'annotate'
  return 'generate'
}

export function hasExplicitTarget(prompt: string): boolean {
  return /上一张|这张图|原图|刚才那张|源图|@图片/.test(prompt)
}

export function lightFromPrompt(prompt: string): {
  direction: string
  brightness: number
  temperature: number
  rim: number
} {
  let direction = 'tl'
  if (/右|侧逆/.test(prompt)) direction = 'right'
  else if (/左侧|左边/.test(prompt)) direction = 'left'
  else if (/顶光|上方|顺光/.test(prompt)) direction = 'top'
  else if (/底光|下方/.test(prompt)) direction = 'bottom'
  const temperature = /冷/.test(prompt) ? -28 : /暖/.test(prompt) ? 28 : 0
  return { direction, brightness: 1.12, temperature, rim: /轮廓光|逆光/.test(prompt) ? 46 : 18 }
}

export function angleFromPrompt(prompt: string): {
  yaw: number
  pitch: number
  zoom: number
  wide: number
} {
  let yaw = 28
  let pitch = 0
  if (/背面|身后/.test(prompt)) yaw = 68
  else if (/左/.test(prompt)) yaw = -36
  else if (/右|侧面/.test(prompt)) yaw = 36
  if (/俯视/.test(prompt)) pitch = -28
  if (/仰视/.test(prompt)) pitch = 24
  return { yaw, pitch, zoom: /近景|特写/.test(prompt) ? 1.18 : 1, wide: /广角/.test(prompt) ? 40 : 8 }
}

export function uid(): string {
  return crypto.randomUUID()
}
