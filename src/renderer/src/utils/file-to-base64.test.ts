// @vitest-environment jsdom
/**
 * file-to-base64 单元测试（ρ2 · P0-R5 + σ1 · P1-R2 扩展 fileToTextAsync）
 */
import { describe, it, expect } from 'vitest'
import { fileToBase64Async, fileToTextAsync } from './file-to-base64'

describe('fileToBase64Async', () => {
  it('把 ASCII File 正确转为 base64（不含 data URL 前缀）', async () => {
    // "hello" -> aGVsbG8=
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' })
    const b64 = await fileToBase64Async(file)
    expect(b64).toBe('aGVsbG8=')
  })

  it('空文件返回空字符串', async () => {
    const file = new File([], 'empty.bin', { type: 'application/octet-stream' })
    const b64 = await fileToBase64Async(file)
    expect(b64).toBe('')
  })

  it('二进制字节（含 0x00）正确 base64 编码', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254])
    const file = new File([bytes], 'bin.1pux', {
      type: 'application/octet-stream'
    })
    const b64 = await fileToBase64Async(file)
    // 解码后应与输入字节完全一致
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    expect(Array.from(decoded)).toEqual([0, 1, 2, 3, 255, 254])
  })

  it('大文件（1MB）也能异步返回而不报错', async () => {
    const size = 1024 * 1024 // 1MB
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) bytes[i] = i & 0xff
    const file = new File([bytes], 'big.1pux', {
      type: 'application/octet-stream'
    })
    const b64 = await fileToBase64Async(file)
    // 长度约为 4/3，确保非空
    expect(b64.length).toBeGreaterThan(1_000_000)
  })
})

describe('fileToTextAsync', () => {
  it('UTF-8 文本正确读取', async () => {
    const file = new File(['hello 世界'], 'a.txt', { type: 'text/plain' })
    const txt = await fileToTextAsync(file)
    expect(txt).toBe('hello 世界')
  })

  it('空文件返回空字符串', async () => {
    const file = new File([], 'empty.csv', { type: 'text/csv' })
    const txt = await fileToTextAsync(file)
    expect(txt).toBe('')
  })

  it('大 JSON（>200KB）能完整读取', async () => {
    const big = 'x'.repeat(300_000)
    const file = new File([big], 'big.json', { type: 'application/json' })
    const txt = await fileToTextAsync(file)
    expect(txt.length).toBe(300_000)
    expect(txt[0]).toBe('x')
  })

  it('保留 CSV 多行结构', async () => {
    const csv = 'name,url\nfoo,https://foo\nbar,https://bar'
    const file = new File([csv], 'p.csv', { type: 'text/csv' })
    const txt = await fileToTextAsync(file)
    expect(txt).toBe(csv)
  })
})
