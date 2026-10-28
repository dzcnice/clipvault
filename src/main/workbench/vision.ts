import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { readImageBytes } from '../storage/image-store'

/**
 * 识图：图片只在主进程加密保存。Host 与会话事件里只出现 [[图片:<id>]] 标记，
 * 桥接向模型发送请求时才把标记展开为图片块。
 */
export const VISION_LIMITS = { maxEdge: 1568, quality: 82, maxImagesPerRequest: 4 }
export interface VisionImage { id: string; mime: 'image/jpeg'; data: string }
export const imageMarker = (id: string): string => `[[图片:${id}]]`
const MARKER = /\[\[图片:([a-f0-9]{16})\]\]/g

export async function visionImage(path: string): Promise<VisionImage> {
  const image = readImageBytes(path)
  const bytes = await sharp(image.bytes).rotate().resize({ width: VISION_LIMITS.maxEdge, height: VISION_LIMITS.maxEdge, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: VISION_LIMITS.quality }).toBuffer()
  return { id: createHash('sha256').update(bytes).digest('hex').slice(0, 16), mime: 'image/jpeg', data: bytes.toString('base64') }
}

type Block = { type: string; text?: string; [key: string]: unknown }
type Message = { role: string; content: string | Block[] }

/**
 * 把 Anthropic Messages 结构里用户文字中的图片标记展开为 image 块。
 * 只展开最新的若干张；更早的、找不到的、或 vision=false 时替换为文字说明。不修改入参。
 */
export function expandImages(data: Record<string, unknown>, lookup: (id: string) => VisionImage | undefined, vision = true): { data: Record<string, unknown>; count: number } {
  const messages = structuredClone(data.messages as Message[] | undefined) ?? []
  let count = 0
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.role !== 'user') continue
    const blocks: Block[] = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
    if (!blocks.some(block => block.type === 'text' && block.text?.includes('[[图片:'))) continue
    const next: Block[] = []
    for (const block of blocks) {
      if (block.type !== 'text' || !block.text?.includes('[[图片:')) { next.push(block); continue }
      let last = 0
      for (const match of block.text.matchAll(MARKER)) {
        const before = block.text.slice(last, match.index)
        last = match.index! + match[0].length
        const image = vision && count < VISION_LIMITS.maxImagesPerRequest ? lookup(match[1]!) : undefined
        if (image) {
          if (before) next.push({ type: 'text', text: before })
          next.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } })
          count++
        } else next.push({ type: 'text', text: before + (vision ? '[图片：较早或已不可用，已省略]' : '[图片：当前模型不支持识图，请依据图片中的文字]') })
      }
      const rest = block.text.slice(last)
      if (rest) next.push({ type: 'text', text: rest })
    }
    // 合并相邻文字块，保持请求紧凑。
    message.content = next.reduce<Block[]>((all, block) => { const prev = all.at(-1); if (prev?.type === 'text' && block.type === 'text') prev.text += block.text ?? ''; else all.push({ ...block }); return all }, [])
  }
  return { data: { ...data, messages }, count }
}
