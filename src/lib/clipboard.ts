export function imageFilesFromTransfer(data: DataTransfer | null): File[] {
  if (!data) return []
  const files: File[] = []
  for (const item of data.items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

export function imageSrcsFromTransfer(data: DataTransfer | null): string[] {
  if (!data) return []
  const html = data.getData('text/html')
  const srcs = [...html.matchAll(/\ssrc=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((src) => /^(data:image\/|blob:|https?:\/\/)/i.test(src))
  const plain = data.getData('text/plain').trim()
  const uri = data.getData('text/uri-list').trim().split(/\s+/).find(Boolean) ?? ''
  for (const src of [plain, uri]) {
    if (/^(data:image\/|blob:|https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|avif)(\?.*)?$)/i.test(src)) srcs.push(src)
  }
  return [...new Set(srcs)]
}

export async function fileFromImageUrl(src: string): Promise<File | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    const ext = (blob.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
    return new File([blob], `粘贴图片.${ext}`, { type: blob.type })
  } catch {
    return null
  }
}
