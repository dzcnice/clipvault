/**
 * HIBP 单测（Sprint 11 · TASK-059）：验证只发前 5 位 hash，
 * 并正确解析响应。
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { checkPasswordLeaked, sha1Upper, _clearHibpCache } from './hibp'

describe('hibp', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    _clearHibpCache()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('sha1Upper 对 "password" 结果为已知 SHA1', () => {
    // sha1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    expect(sha1Upper('password')).toBe(
      '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'
    )
  })

  it('只把前 5 位 hash 发给 API，返回的 count 正确解析', async () => {
    const sha = sha1Upper('password') // 5BAA6 1E4C9B93F...
    const prefix = sha.slice(0, 5)
    const suffix = sha.slice(5)

    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}
    globalThis.fetch = vi.fn(async (url: string, opts: RequestInit) => {
      capturedUrl = url
      capturedHeaders = (opts.headers ?? {}) as Record<string, string>
      // 返回两行：其中一条匹配我们密码
      const body = `AAAA11111111111111111111111111111111:5\n${suffix}:12345\nBBBB22222222222222222222222222222222:7`
      return new Response(body, { status: 200 })
    }) as unknown as typeof fetch

    const n = await checkPasswordLeaked('password')
    expect(n).toBe(12345)
    expect(capturedUrl).toContain(`/range/${prefix}`)
    // 绝不应出现完整 hash
    expect(capturedUrl).not.toContain(suffix)
    expect(capturedHeaders['User-Agent']).toBe('ClipVault/2.0')
  })

  it('未命中返回 0', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('AAAA11111111111111111111111111111111:1', { status: 200 })
    ) as unknown as typeof fetch
    const n = await checkPasswordLeaked('some-very-random-pw-xyz-987')
    expect(n).toBe(0)
  })

  it('HTTP 非 2xx 抛错', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('err', { status: 503 })
    ) as unknown as typeof fetch
    await expect(checkPasswordLeaked('x')).rejects.toThrow(/HIBP HTTP/)
  })
})
