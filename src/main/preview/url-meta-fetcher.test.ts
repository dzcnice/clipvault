/**
 * URL meta fetcher 单测（Sprint 11 · TASK-060）
 *
 * 不真实发起网络 —— mock electron 的 net.request。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

/** mock net.request：返回一个 fake req，test 再喂给它 response */
interface MockReq extends EventEmitter {
  setHeader: (k: string, v: string) => void
  end: () => void
  abort: () => void
  _push: (status: number, body: string) => void
}

let nextReq: MockReq | null = null

function makeMockReq(): MockReq {
  const ee = new EventEmitter() as MockReq
  ee.setHeader = vi.fn()
  ee.end = (): void => {
    // 触发 response 事件由测试控制
  }
  ee.abort = vi.fn()
  ee._push = (_status: number, body: string): void => {
    const resp = new EventEmitter() as EventEmitter & {
      statusCode?: number
      headers?: Record<string, string>
    }
    resp.statusCode = _status
    resp.headers = { 'content-type': 'text/html' }
    ee.emit('response', resp)
    setImmediate(() => {
      resp.emit('data', Buffer.from(body, 'utf8'))
      resp.emit('end')
    })
  }
  return ee
}

vi.mock('electron', () => ({
  net: {
    request: (): MockReq => {
      const r = makeMockReq()
      nextReq = r
      return r
    }
  }
}))

import { fetchUrlMeta } from './url-meta-fetcher'

describe('fetchUrlMeta', () => {
  beforeEach(() => {
    nextReq = null
  })

  it('非 http(s) 协议直接返回 error', async () => {
    const m = await fetchUrlMeta('ftp://foo.com', 1000)
    expect(m.error).toBeTruthy()
  })

  it('从 HTML <title> 与 og:* 正确提取 meta', async () => {
    const html = `
<!doctype html><html><head>
<title>Example Page</title>
<meta name="description" content="A nice page">
<meta property="og:title" content="OG Title">
<meta property="og:image" content="/img.png">
<link rel="icon" href="/favicon.ico">
</head><body></body></html>`
    const promise = fetchUrlMeta('https://example.com/path', 1000)
    // 等 microtask，fake req 准备好
    await new Promise((r) => setImmediate(r))
    nextReq!._push(200, html)
    const meta = await promise
    expect(meta.title).toBe('OG Title')
    expect(meta.description).toBe('A nice page')
    expect(meta.image).toBe('https://example.com/img.png')
    expect(meta.favicon).toBe('https://example.com/favicon.ico')
    expect(meta.error).toBeUndefined()
  })

  it('超时返回 timeout error', async () => {
    const promise = fetchUrlMeta('https://slow.example.com', 20)
    // 不喂任何 response
    const meta = await promise
    expect(meta.error).toBe('timeout')
  })

  it('req 触发 error 返回错误信息', async () => {
    const promise = fetchUrlMeta('https://err.example.com', 500)
    await new Promise((r) => setImmediate(r))
    nextReq!.emit('error', new Error('ECONNRESET'))
    const meta = await promise
    expect(meta.error).toBe('ECONNRESET')
  })
})
