import { describe, expect, it, vi } from 'vitest'
vi.mock('../crypto/vault', () => ({ getDEK: () => Buffer.alloc(32, 3) }))
import { encodeImage, decodeImage } from './image-codec'

describe('authenticated image storage', () => {
  it('preserves exact bytes but never writes the original plaintext in the stored asset', () => {
    const bytes = Buffer.from('IMAGE-PRIVATE-CANARY-2026'), encoded = encodeImage({ mime: 'image/png', bytes })
    expect(encoded.includes(bytes)).toBe(false)
    expect(decodeImage(encoded, '.cvimg')).toEqual({ mime: 'image/png', bytes })
    expect(() => decodeImage(encoded, '.cvimg', Buffer.alloc(32, 9))).toThrow()
    encoded[24] = encoded[24]! ^ 1
    expect(() => decodeImage(encoded, '.cvimg')).toThrow()
  })
  it('refuses truncated encrypted files and preserves legacy bytes for lossless conversion', () => {
    expect(() => decodeImage(Buffer.from('broken'), '.cvimg')).toThrow('加密图片头')
    const old = Buffer.from('legacy-image')
    expect(decodeImage(old, '.jpg')).toEqual({ mime: 'image/jpeg', bytes: old })
  })
})
