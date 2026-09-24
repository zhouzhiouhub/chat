import { ratioValue } from './catalog'
import type { EnhanceMode, SplitSize, ToolId } from '../types'

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败'))
    image.src = src
  })
}

export function canvasSize(ratio: string, longEdge = 768): { w: number; h: number } {
  const [a, b] = ratioValue(ratio)
  if (a >= b) return { w: longEdge, h: Math.max(1, Math.round((longEdge * b) / a)) }
  return { w: Math.max(1, Math.round((longEdge * a) / b)), h: longEdge }
}

function canvas2d(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  return { canvas, ctx }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let next = Math.imul(state ^ (state >>> 15), 1 | state)
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function paletteFor(prompt: string): string[] {
  const themes: { keys: RegExp; colors: string[] }[] = [
    { keys: /瓶|护肤|精华|香水|产品|包装/, colors: ['#07111f', '#16324f', '#d5dde6', '#9fd4ff'] },
    { keys: /街|霓虹|雨夜|城市|夜/, colors: ['#100816', '#2a1248', '#ff4d8d', '#3ec6ff'] },
    { keys: /海|水|雾|冰|冷/, colors: ['#071422', '#12324a', '#8ec4d4', '#e7f3f6'] },
    { keys: /日落|暖|黄昏|沙漠|金/, colors: ['#2a1208', '#c4552a', '#f0b36a', '#f7e7cf'] },
    { keys: /人|女|男|角色|肖像|脸|外套/, colors: ['#1a1614', '#8d6b5c', '#ead8cb', '#f6f1ea'] },
    { keys: /森林|植物|自然|大理石|清晨/, colors: ['#121a14', '#1e4634', '#d7e2d2', '#f4f7f1'] },
  ]
  const found = themes.find((item) => item.keys.test(prompt))
  return found?.colors ?? ['#1c1917', '#3f4a45', '#d9cfc3', '#f3efe8']
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[]) {
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, colors[0])
  gradient.addColorStop(0.58, colors[1])
  gradient.addColorStop(1, colors[0])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.18, 8, w * 0.5, h * 0.16, w * 0.62)
  glow.addColorStop(0, hexAlpha(colors[3], 0.5))
  glow.addColorStop(1, hexAlpha(colors[3], 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const shade = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.72)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, w, h)
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) {
  const image = ctx.getImageData(0, 0, w, h)
  const data = image.data
  for (let index = 0; index < data.length; index += 16) {
    const shift = (rand() - 0.5) * 22
    data[index] = Math.max(0, Math.min(255, data[index] + shift))
    data[index + 1] = Math.max(0, Math.min(255, data[index + 1] + shift))
    data[index + 2] = Math.max(0, Math.min(255, data[index + 2] + shift))
  }
  ctx.putImageData(image, 0, 0)
}

type SceneKind = 'bottle' | 'street' | 'portrait' | 'land' | 'poster'

function sceneKind(prompt: string, rand: () => number): SceneKind {
  if (/瓶|护肤|精华|香水|产品|包装/.test(prompt)) return 'bottle'
  if (/街|霓虹|雨|城市/.test(prompt)) return 'street'
  if (/人|女|男|角色|肖像|脸|外套/.test(prompt)) return 'portrait'
  if (/山|海|风景|森林|天空|日落|大理石|台面/.test(prompt)) return 'land'
  const kinds: SceneKind[] = ['poster', 'land', 'bottle', 'portrait']
  return kinds[Math.floor(rand() * kinds.length)]
}

function drawBottle(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[], rand: () => number) {
  const cx = w * 0.5
  const base = h * 0.8
  const bw = Math.min(w, h) * 0.24
  const bh = h * 0.4
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.ellipse(cx, base, bw * 0.85, bh * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
  roundRect(ctx, cx - bw / 2, base - bh, bw, bh, bw * 0.18)
  const body = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0)
  body.addColorStop(0, colors[1])
  body.addColorStop(0.42, '#f4f8fb')
  body.addColorStop(1, colors[2])
  ctx.fillStyle = body
  ctx.fill()
  roundRect(ctx, cx - bw * 0.28, base - bh - bh * 0.18, bw * 0.56, bh * 0.18, 8)
  ctx.fillStyle = colors[3]
  ctx.fill()
  ctx.fillStyle = colors[0]
  ctx.globalAlpha = 0.82
  ctx.fillRect(cx - bw * 0.34, base - bh * 0.46, bw * 0.68, bh * 0.2)
  ctx.globalAlpha = 1
  ctx.fillStyle = hexAlpha(colors[3], 0.85)
  ctx.fillRect(cx - bw * 0.22, base - bh * 0.4, bw * 0.28, 3)
  for (let index = 0; index < 16; index += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.1})`
    ctx.beginPath()
    ctx.arc(rand() * w, rand() * h * 0.7, 8 + rand() * 36, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawStreet(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[], rand: () => number) {
  const horizon = h * 0.46
  ctx.fillStyle = colors[0]
  ctx.fillRect(0, horizon, w, h - horizon)
  for (let index = 0; index < 7; index += 1) {
    const bw = w * (0.08 + rand() * 0.08)
    const bx = (index / 7) * w + rand() * 10
    const bh = horizon * (0.35 + rand() * 0.55)
    ctx.fillStyle = index % 2 === 0 ? colors[1] : '#14081f'
    ctx.fillRect(bx, horizon - bh, bw, bh)
    ctx.fillStyle = rand() > 0.5 ? colors[2] : colors[3]
    ctx.globalAlpha = 0.85
    ctx.fillRect(bx + bw * 0.2, horizon - bh * 0.72, bw * 0.5, bh * 0.12)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.moveTo(w * 0.5, horizon)
  ctx.lineTo(0, h)
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = hexAlpha(colors[3], 0.45)
  ctx.lineWidth = 2
  for (let index = 0; index < 5; index += 1) {
    const y = horizon + ((index + 1) / 5) * (h - horizon)
    ctx.beginPath()
    ctx.moveTo(w * 0.5 - index * 28, y)
    ctx.lineTo(w * 0.5 + index * 28, y)
    ctx.stroke()
  }
  const figureX = w * 0.62
  ctx.fillStyle = '#1a120c'
  roundRect(ctx, figureX, horizon - h * 0.16, w * 0.035, h * 0.16, 8)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(figureX + w * 0.017, horizon - h * 0.18, w * 0.014, 0, Math.PI * 2)
  ctx.fill()
}

function drawPortrait(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[]) {
  const cx = w * 0.5
  const cy = h * 0.46
  const head = Math.min(w, h) * 0.16
  ctx.fillStyle = colors[1]
  ctx.beginPath()
  ctx.ellipse(cx, cy - head * 0.15, head * 1.15, head * 1.35, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colors[2]
  ctx.beginPath()
  ctx.ellipse(cx, cy + head * 0.08, head * 0.78, head * 0.96, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colors[1]
  ctx.fillRect(cx - head * 0.9, cy - head * 0.2, head * 0.28, head * 0.7)
  ctx.strokeStyle = colors[0]
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx - head * 0.28, cy, head * 0.08, 0, Math.PI * 2)
  ctx.arc(cx + head * 0.28, cy, head * 0.08, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = colors[3]
  ctx.beginPath()
  ctx.moveTo(cx - head * 1.7, h * 0.92)
  ctx.quadraticCurveTo(cx, cy + head * 1.3, cx + head * 1.7, h * 0.92)
  ctx.lineTo(cx + head * 1.7, h)
  ctx.lineTo(cx - head * 1.7, h)
  ctx.closePath()
  ctx.fill()
}

function drawLand(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[], prompt: string) {
  const horizon = /台面|大理石/.test(prompt) ? h * 0.58 : h * 0.62
  ctx.fillStyle = colors[3]
  ctx.beginPath()
  ctx.arc(w * 0.72, h * 0.28, Math.min(w, h) * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colors[2]
  ctx.beginPath()
  ctx.moveTo(0, horizon)
  ctx.quadraticCurveTo(w * 0.25, horizon - h * 0.12, w * 0.48, horizon)
  ctx.quadraticCurveTo(w * 0.72, horizon + h * 0.08, w, horizon - h * 0.04)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = colors[1]
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.moveTo(0, horizon + h * 0.08)
  ctx.quadraticCurveTo(w * 0.4, horizon + h * 0.2, w, horizon + h * 0.05)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  if (/瓶|精华|产品/.test(prompt)) drawBottle(ctx, w, h, colors, mulberry32(3))
}

function drawPoster(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[], rand: () => number) {
  ctx.fillStyle = hexAlpha(colors[3], 0.16)
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.58, Math.min(w, h) * 0.28, 0, Math.PI * 2)
  ctx.fill()
  for (let index = 0; index < 4; index += 1) {
    ctx.fillStyle = hexAlpha(index % 2 ? colors[2] : colors[3], 0.75)
    const bw = w * (0.08 + rand() * 0.12)
    const bh = h * (0.18 + rand() * 0.22)
    roundRect(ctx, w * (0.18 + index * 0.16), h * 0.48, bw, bh, 10)
    ctx.fill()
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  prompt: string,
  seed: number,
  leaveTitleSpace: boolean,
) {
  const rand = mulberry32(seed)
  const colors = paletteFor(prompt)
  drawBackdrop(ctx, w, h, colors)
  ctx.save()
  if (leaveTitleSpace) {
    ctx.beginPath()
    ctx.rect(0, h * 0.22, w, h * 0.78)
    ctx.clip()
  }
  const kind = sceneKind(prompt, rand)
  if (kind === 'bottle') drawBottle(ctx, w, h, colors, rand)
  else if (kind === 'street') drawStreet(ctx, w, h, colors, rand)
  else if (kind === 'portrait') drawPortrait(ctx, w, h, colors)
  else if (kind === 'land') drawLand(ctx, w, h, colors, prompt)
  else drawPoster(ctx, w, h, colors, rand)
  ctx.restore()
  vignette(ctx, w, h)
  grain(ctx, w, h, rand)
}

function output(canvas: HTMLCanvasElement, mime: 'image/jpeg' | 'image/png'): string {
  return canvas.toDataURL(mime, 0.86)
}

async function paintScene(prompt: string, ratio: string, seed: number, longEdge = 768): Promise<HTMLCanvasElement> {
  const { w, h } = canvasSize(ratio, longEdge)
  const { canvas, ctx } = canvas2d(w, h)
  drawScene(ctx, w, h, prompt, seed, /标题|上方留/.test(prompt) || ratio === '9:16')
  return canvas
}

const GRID_LABELS = ['正面', '左侧', '右侧', '俯视', '仰视', '近景', '中景', '远景', '背面']

async function paintGrid(prompt: string, ratio: string, seed: number): Promise<HTMLCanvasElement> {
  const { w, h } = canvasSize(ratio, 900)
  const { canvas, ctx } = canvas2d(w, h)
  ctx.fillStyle = '#ece7df'
  ctx.fillRect(0, 0, w, h)
  const gap = Math.round(Math.min(w, h) * 0.018)
  const cellW = (w - gap * 4) / 3
  const cellH = (h - gap * 4) / 3
  for (let index = 0; index < 9; index += 1) {
    const col = index % 3
    const row = Math.floor(index / 3)
    const cell = await paintScene(`${prompt} ${GRID_LABELS[index]}`, '1:1', seed + index * 17, 360)
    const x = gap + col * (cellW + gap)
    const y = gap + row * (cellH + gap)
    ctx.drawImage(cell, x, y, cellW, cellH)
    ctx.fillStyle = 'rgba(28,25,23,0.72)'
    ctx.fillRect(x + 8, y + 8, 52, 22)
    ctx.fillStyle = '#f7f6f3'
    ctx.font = '12px sans-serif'
    ctx.fillText(GRID_LABELS[index], x + 16, y + 23)
  }
  return canvas
}

function directionVector(direction: string): [number, number] {
  const map: Record<string, [number, number]> = {
    left: [0, 0.5],
    right: [1, 0.5],
    top: [0.5, 0],
    bottom: [0.5, 1],
    tl: [0, 0],
    tr: [1, 0],
    bl: [0, 1],
    br: [1, 1],
  }
  return map[direction] ?? [0, 0]
}

function applyRelight(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  w: number,
  h: number,
  light: { direction: string; brightness: number; temperature: number; rim: number },
) {
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, w, h)
  ctx.filter = `brightness(${light.brightness})`
  ctx.drawImage(source, 0, 0, w, h)
  ctx.filter = 'none'
  const [sx, sy] = directionVector(light.direction)
  const warm = light.temperature > 0
  const color = warm ? `rgba(255, 176, 92, ${Math.min(0.55, Math.abs(light.temperature) / 80)})` : `rgba(142, 196, 255, ${Math.min(0.55, Math.abs(light.temperature) / 80)})`
  const gradient = ctx.createLinearGradient(sx * w, sy * h, (1 - sx) * w, (1 - sy) * h)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.05)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.28)')
  ctx.globalCompositeOperation = 'soft-light'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
  if (light.rim > 0) {
    const rim = ctx.createLinearGradient((1 - sx) * w, (1 - sy) * h, sx * w, sy * h)
    rim.addColorStop(0, `rgba(255,244,220,${light.rim / 180})`)
    rim.addColorStop(0.35, 'rgba(255,244,220,0)')
    ctx.fillStyle = rim
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = 'source-over'
}

function applyAngle(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  w: number,
  h: number,
  angle: { yaw: number; pitch: number; zoom: number; wide: number },
) {
  ctx.filter = 'blur(18px)'
  ctx.drawImage(source, -24, -24, w + 48, h + 48)
  ctx.filter = 'none'
  ctx.save()
  ctx.translate(w / 2, h / 2)
  const wide = angle.wide / 100
  ctx.transform(
    angle.zoom * (1 + wide * 0.18),
    angle.pitch / 220,
    -angle.yaw / 220,
    angle.zoom * (1 - wide * 0.08),
    angle.yaw * 0.55,
    angle.pitch * 0.4,
  )
  ctx.drawImage(source, -w / 2, -h / 2, w, h)
  ctx.restore()
}

async function maskedComposite(
  source: HTMLImageElement,
  prompt: string,
  seed: number,
  mask: HTMLCanvasElement | null | undefined,
  mode: 'redraw' | 'erase',
): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = canvas2d(source.width > source.height ? 768 : Math.round(768 * (source.width / source.height)), source.width > source.height ? Math.round(768 * (source.height / source.width)) : 768)
  const w = canvas.width
  const h = canvas.height
  ctx.drawImage(source, 0, 0, w, h)
  if (mode === 'erase') {
    const blurred = canvas2d(w, h)
    blurred.ctx.filter = 'blur(16px)'
    blurred.ctx.drawImage(source, 0, 0, w, h)
    if (mask) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.drawImage(mask, 0, 0, w, h)
      ctx.globalCompositeOperation = 'destination-over'
      ctx.drawImage(blurred.canvas, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    } else {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(w * 0.55, h * 0.48, w * 0.16, h * 0.18, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(blurred.canvas, 0, 0)
      ctx.restore()
    }
    return canvas
  }

  const scene = await paintScene(prompt, '1:1', seed, 640)
  if (mask) {
    const layer = canvas2d(w, h)
    layer.ctx.drawImage(scene, 0, 0, w, h)
    layer.ctx.globalCompositeOperation = 'destination-in'
    layer.ctx.filter = 'blur(10px)'
    layer.ctx.drawImage(mask, 0, 0, w, h)
    layer.ctx.filter = 'none'
    ctx.drawImage(layer.canvas, 0, 0)
    return canvas
  }
  ctx.save()
  ctx.globalAlpha = 0.78
  ctx.drawImage(scene, 0, h * 0.18, w, h * 0.82)
  ctx.restore()
  return canvas
}

export interface ComposeInput {
  prompt: string
  ratio: string
  seed: number
  tool: ToolId
  sourceUrl?: string
  referenceUrls?: string[]
  mask?: HTMLCanvasElement | null
  light?: { direction: string; brightness: number; temperature: number; rim: number }
  angle?: { yaw: number; pitch: number; zoom: number; wide: number }
  enhance?: EnhanceMode
  detail?: '低' | '中' | '高'
}

export async function composeImage(input: ComposeInput): Promise<string> {
  if (input.tool === 'grid') {
    const grid = await paintGrid(input.prompt, input.ratio === '自动' ? '1:1' : input.ratio, input.seed)
    if (input.referenceUrls?.[0]) {
      try {
        const ref = await loadImage(input.referenceUrls[0])
        const ctx = grid.getContext('2d')
        if (ctx) {
          ctx.globalAlpha = 0.16
          ctx.globalCompositeOperation = 'soft-light'
          ctx.drawImage(ref, 0, 0, grid.width, grid.height)
        }
      } catch {
        // A missing reference still leaves the grid preview.
      }
    }
    return output(grid, 'image/jpeg')
  }

  if (input.sourceUrl && input.tool !== 'generate') {
    const source = await loadImage(input.sourceUrl)
    const long = input.enhance === 'upscale' ? 1100 : input.detail === '高' ? 960 : 768
    if (input.tool === 'outpaint') {
      const { w, h } = canvasSize(input.ratio, long)
      const { canvas, ctx } = canvas2d(w, h)
      const bg = await paintScene(input.prompt || '延伸当前画面的环境', input.ratio, input.seed, long)
      ctx.drawImage(bg, 0, 0, w, h)
      const scale = Math.min((w * 0.72) / source.width, (h * 0.72) / source.height)
      const dw = source.width * scale
      const dh = source.height * scale
      ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh)
      return output(canvas, 'image/jpeg')
    }
    if (input.tool === 'relight' && input.light) {
      const fitted = fitBox(source.width, source.height, long)
      const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
      applyRelight(ctx, source, fitted.w, fitted.h, input.light)
      return output(canvas, 'image/jpeg')
    }
    if (input.tool === 'angle' && input.angle) {
      const fitted = fitBox(source.width, source.height, long)
      const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
      applyAngle(ctx, source, fitted.w, fitted.h, input.angle)
      return output(canvas, 'image/jpeg')
    }
    if (input.tool === 'redraw' || input.tool === 'erase') {
      const layer = await maskedComposite(source, input.prompt, input.seed, input.mask, input.tool)
      return output(layer, 'image/jpeg')
    }
    if (input.tool === 'enhance') {
      const fitted = fitBox(source.width, source.height, input.enhance === 'upscale' ? 1100 : 860)
      const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
      ctx.filter = input.enhance === 'upscale' ? 'contrast(1.12) saturate(1.08)' : 'contrast(1.06) saturate(1.04)'
      ctx.drawImage(source, 0, 0, fitted.w, fitted.h)
      ctx.filter = 'none'
      return output(canvas, 'image/jpeg')
    }
    if (input.tool === 'annotate' && input.mask) {
      const fitted = fitBox(source.width, source.height, 768)
      const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
      ctx.drawImage(source, 0, 0, fitted.w, fitted.h)
      ctx.drawImage(input.mask, 0, 0, fitted.w, fitted.h)
      return output(canvas, 'image/jpeg')
    }
  }

  const scene = await paintScene(input.prompt, input.ratio === '自动' ? '1:1' : input.ratio, input.seed)
  if (input.referenceUrls?.[0]) {
    try {
      const ref = await loadImage(input.referenceUrls[0])
      const ctx = scene.getContext('2d')
      if (ctx) {
        ctx.globalAlpha = 0.28
        ctx.globalCompositeOperation = 'soft-light'
        ctx.drawImage(ref, 0, 0, scene.width, scene.height)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    } catch {
      // Ignore unreadable reference and keep the generated preview.
    }
  }
  return output(scene, 'image/jpeg')
}

function fitBox(width: number, height: number, longEdge: number): { w: number; h: number } {
  if (width >= height) return { w: longEdge, h: Math.max(1, Math.round((longEdge * height) / width)) }
  return { w: Math.max(1, Math.round((longEdge * width) / height)), h: longEdge }
}

export async function cropImage(url: string, rect: { x: number; y: number; w: number; h: number }): Promise<string> {
  const image = await loadImage(url)
  const sx = Math.max(0, rect.x * image.width)
  const sy = Math.max(0, rect.y * image.height)
  const sw = Math.max(1, Math.min(image.width - sx, rect.w * image.width))
  const sh = Math.max(1, Math.min(image.height - sy, rect.h * image.height))
  const fitted = fitBox(sw, sh, 768)
  const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, fitted.w, fitted.h)
  return output(canvas, 'image/jpeg')
}

export async function cropToRatio(url: string, ratioName: string): Promise<string> {
  const image = await loadImage(url)
  const [a, b] = ratioValue(ratioName)
  const target = a / b
  const current = image.width / image.height
  let sw = image.width
  let sh = image.height
  if (current > target) sw = image.height * target
  else sh = image.width / target
  return cropImage(url, {
    x: (image.width - sw) / 2 / image.width,
    y: (image.height - sh) / 2 / image.height,
    w: sw / image.width,
    h: sh / image.height,
  })
}

export async function resizeImage(url: string, width: number, height: number): Promise<string> {
  const image = await loadImage(url)
  const w = Math.max(64, Math.min(1600, Math.round(width)))
  const h = Math.max(64, Math.min(1600, Math.round(height)))
  const { canvas, ctx } = canvas2d(w, h)
  ctx.drawImage(image, 0, 0, w, h)
  return output(canvas, 'image/jpeg')
}

export async function sliceGrid(url: string, size: SplitSize): Promise<string[]> {
  const image = await loadImage(url)
  const cellW = image.width / size
  const cellH = image.height / size
  const urls: string[] = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const fitted = fitBox(cellW, cellH, 640)
      const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
      ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, 0, 0, fitted.w, fitted.h)
      urls.push(output(canvas, 'image/jpeg'))
    }
  }
  return urls
}

export async function cutoutImage(url: string): Promise<string> {
  const image = await loadImage(url)
  const fitted = fitBox(image.width, image.height, 768)
  const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
  ctx.drawImage(image, 0, 0, fitted.w, fitted.h)
  const frame = ctx.getImageData(0, 0, fitted.w, fitted.h)
  const data = frame.data
  const w = fitted.w
  const h = fitted.h
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  const sample = (x: number, y: number) => {
    const index = (y * w + x) * 4
    red += data[index]
    green += data[index + 1]
    blue += data[index + 2]
    count += 1
  }
  for (let x = 0; x < w; x += 1) {
    sample(x, 0)
    sample(x, h - 1)
  }
  for (let y = 0; y < h; y += 1) {
    sample(0, y)
    sample(w - 1, y)
  }
  red /= count
  green /= count
  blue /= count
  const seen = new Uint8Array(w * h)
  const qx = new Int32Array(w * h)
  const qy = new Int32Array(w * h)
  let qs = 0
  let qe = 0
  const push = (x: number, y: number) => {
    const position = y * w + x
    if (seen[position]) return
    const index = position * 4
    const distance = Math.abs(data[index] - red) + Math.abs(data[index + 1] - green) + Math.abs(data[index + 2] - blue)
    if (distance > 52) return
    seen[position] = 1
    qx[qe] = x
    qy[qe] = y
    qe += 1
  }
  for (let x = 0; x < w; x += 1) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y)
    push(w - 1, y)
  }
  while (qs < qe) {
    const x = qx[qs]
    const y = qy[qs]
    qs += 1
    data[(y * w + x) * 4 + 3] = 0
    if (x > 0) push(x - 1, y)
    if (x + 1 < w) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y + 1 < h) push(x, y + 1)
  }
  let opaque = 0
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 16) opaque += 1
  }
  if (opaque < w * h * 0.08) {
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(w / 2, h / 2, w * 0.28, h * 0.36, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(image, 0, 0, w, h)
    ctx.restore()
    return output(canvas, 'image/png')
  }
  ctx.putImageData(frame, 0, 0)
  return output(canvas, 'image/png')
}

export async function downscaleFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const fitted = fitBox(image.width, image.height, 1280)
    const { canvas, ctx } = canvas2d(fitted.w, fitted.h)
    ctx.drawImage(image, 0, 0, fitted.w, fitted.h)
    return output(canvas, 'image/jpeg')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadDataUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

export function maskIsEmpty(mask: HTMLCanvasElement | null): boolean {
  if (!mask) return true
  const ctx = mask.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true
  const data = ctx.getImageData(0, 0, mask.width, mask.height).data
  for (let index = 3; index < data.length; index += 64) {
    if (data[index] > 8) return false
  }
  return true
}
