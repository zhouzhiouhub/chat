export type Role = 'user' | 'assistant'

export type Mode = 'confirm' | 'auto'

export type ReferenceRole = 'product' | 'character' | 'composition' | 'style' | 'light'

export type ToolId =
  | 'generate'
  | 'grid'
  | 'crop'
  | 'angle'
  | 'redraw'
  | 'relight'
  | 'outpaint'
  | 'erase'
  | 'annotate'
  | 'enhance'
  | 'resize'
  | 'cutout'
  | 'split'

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '自动'

export type Resolution = '1K' | '2K' | '4K'

export type Quality = '低' | '中' | '高' | '超高' | '极致'

export type Detail = '低' | '中' | '高'

export type EnhanceMode = 'clarity' | 'upscale'

export type SplitSize = 2 | 3 | 4

export interface Attachment {
  id: string
  name: string
  url: string
  role: ReferenceRole
  imageId?: string
}

export interface ImageAsset {
  id: string
  url: string
  prompt: string
  modelId: string
  modelName: string
  ratio: string
  resolution: string
  tool: ToolId
  label: string
  parentId?: string
  transparent?: boolean
  grid?: SplitSize | null
}

export interface ConfirmSpec {
  status: 'pending' | 'generating' | 'done' | 'cancelled'
  tool: ToolId
  prompt: string
  modelId: string
  ratio: AspectRatio
  resolution: Resolution
  count: number
  quality: Quality
  detail: Detail
  enhance: EnhanceMode
  split: SplitSize
  references: { name: string; role: ReferenceRole }[]
  referenceUrls: string[]
  sourceUrl?: string
  sourceLabel?: string
  sourceImageId?: string
  summary: string
}

export interface Message {
  id: string
  role: Role
  text: string
  plan: string[]
  attachments: Attachment[]
  confirm: ConfirmSpec | null
  images: ImageAsset[]
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
}

export interface EditorState {
  tool: ToolId
  prompt: string
  sourceUrl: string
  sourceLabel: string
  parentImageId?: string
  transparent?: boolean
  grid?: SplitSize | null
}

export interface LightboxState {
  images: ImageAsset[]
  index: number
}
