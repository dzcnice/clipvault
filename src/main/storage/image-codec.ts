import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getDEK } from '../crypto/vault'

const MAGIC = Buffer.from('CVIMG01\0')
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024
export interface ImageBytes { bytes: Buffer; mime: string }
const mimePattern = /^image\/(png|jpeg|webp|gif)$/

export function encodeImage(image: ImageBytes, providedKey?: Buffer): Buffer {
  if (!mimePattern.test(image.mime) || image.bytes.length > MAX_IMAGE_BYTES) throw new Error('图片格式或大小不受支持')
  const key = providedKey ? Buffer.from(providedKey) : getDEK()
  if (!key) throw new Error('请先解锁资料库')
  try {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(MAGIC)
    const plain = Buffer.concat([Buffer.from(image.mime + '\n'), image.bytes])
    try { return Buffer.concat([MAGIC, iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]) }
    finally { plain.fill(0) }
  } finally { key.fill(0) }
}

export function decodeImage(data: Buffer, extension = '.png', providedKey?: Buffer): ImageBytes {
  if (data.length > MAX_IMAGE_BYTES + 128) throw new Error('图片超过 32 MB 上限')
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (extension === '.cvimg') throw new Error('加密图片头无效')
    const mime = /\.jpe?g$/i.test(extension) ? 'image/jpeg' : /\.webp$/i.test(extension) ? 'image/webp' : /\.gif$/i.test(extension) ? 'image/gif' : 'image/png'
    return { mime, bytes: data }
  }
  if (data.length < MAGIC.length + 29) throw new Error('加密图片不完整')
  const key = providedKey ? Buffer.from(providedKey) : getDEK()
  if (!key) throw new Error('请先解锁资料库')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(8, 20))
    decipher.setAAD(MAGIC); decipher.setAuthTag(data.subarray(-16))
    const plain = Buffer.concat([decipher.update(data.subarray(20, -16)), decipher.final()])
    const split = plain.indexOf(10), mime = plain.subarray(0, split).toString()
    if (split < 0 || split > 32 || !mimePattern.test(mime)) { plain.fill(0); throw new Error('加密图片格式无效') }
    const bytes = Buffer.from(plain.subarray(split + 1)); plain.fill(0)
    return { mime, bytes }
  } finally { key.fill(0) }
}
