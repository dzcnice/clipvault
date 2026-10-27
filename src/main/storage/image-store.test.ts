import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import sharp from 'sharp'

const state = vi.hoisted(() => ({ directory: '' }))
vi.mock('../prefs', () => ({ resolveImagesDir: () => state.directory, getDefaultImagesDir: () => state.directory }))
vi.mock('../crypto/vault', () => ({ getDEK: () => Buffer.alloc(32, 7) }))
import { saveImageDataUrl, copyImageFile, deleteImageFile, loadThumbnailAsDataUrl, readImageBytes, exportImagePath } from './image-store'

describe('M1 original images and independent snapshots', () => {
  beforeEach(() => { state.directory = mkdtempSync(join(tmpdir(), 'clipvault-images-test-')) })
  afterEach(() => {
    if (resolve(state.directory).startsWith(resolve(tmpdir()) + sep) && state.directory.includes('clipvault-images-test-')) rmSync(state.directory, { recursive: true, force: true })
  })
  it('preserves large original bytes and dimensions while generating a separate small thumbnail', async () => {
    const original = await sharp({ create: { width: 2200, height: 1300, channels: 4, background: '#18496f' } }).png().toBuffer()
    const path = await saveImageDataUrl(`data:image/png;base64,${original.toString('base64')}`)
    expect(readFileSync(path!).includes(original)).toBe(false)
    expect(readImageBytes(path!).bytes).toEqual(original)
    const thumb = await loadThumbnailAsDataUrl(path!)
    const thumbMetadata = await sharp(Buffer.from(thumb!.split(',')[1]!, 'base64')).metadata()
    expect(thumbMetadata.width).toBeLessThanOrEqual(240)
    expect(readImageBytes(path!).bytes).toEqual(original)
    expect(readFileSync(exportImagePath(path!))).toEqual(original)
    const snapshot = copyImageFile(path!)
    expect(snapshot).not.toBe(path)
    deleteImageFile(path!)
    expect(readImageBytes(snapshot).bytes).toEqual(original)
  })
  it('does not create a fake saved copy when the source file is missing', () => {
    expect(() => copyImageFile(join(state.directory, 'missing.png'))).toThrow('原图片已不存在')
  })
})
