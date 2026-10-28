import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({}))
vi.mock('../workbench/redaction', () => ({
  allResourceSecrets: () => ['Synthetic-Saved-Secret-123'],
  containsSecrets: (text: string, secrets: string[]) => secrets.some(secret => text.includes(secret)),
  findBlockingSecret: (text: string) => /sk-[A-Za-z0-9]{20,}/.test(text) ? 'api_key' : null
}))
import { assertPublicURL, isBlockedAddress, parseBingRss, webFetch, webSearch, WEB_LIMITS } from './web'

const publicDns = (async () => [{ address: '93.184.216.34', family: 4 }]) as never
const dns = (map: Record<string, string>) => (async (host: string) => [{ address: map[host] ?? '93.184.216.34', family: 4 }]) as never
const page = (body: string | Uint8Array<ArrayBuffer>, init: ResponseInit & { type?: string } = {}): Response => new Response(body, { status: init.status ?? 200, headers: { 'content-type': init.type ?? 'text/html; charset=utf-8', ...(init.headers as Record<string, string> ?? {}) } })

describe('web egress guard', () => {
  it('blocks loopback, private, link-local, CGNAT, multicast and mapped IPv6 addresses', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', 'not-an-ip'])
      expect(isBlockedAddress(address), address).toBe(true)
    for (const address of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) expect(isBlockedAddress(address), address).toBe(false)
  })
  it('rejects non-web schemes, embedded credentials, odd ports, local names and protected values', async () => {
    await expect(assertPublicURL('file:///C:/Windows/win.ini', publicDns)).rejects.toThrow('http(s)')
    await expect(assertPublicURL('https://user:pass@example.com/', publicDns)).rejects.toThrow('http(s)')
    await expect(assertPublicURL('https://example.com:22/', publicDns)).rejects.toThrow('端口')
    await expect(assertPublicURL('http://localhost:8080/', publicDns)).rejects.toThrow('本机')
    await expect(assertPublicURL('http://192.168.0.10/', publicDns)).rejects.toThrow('局域网')
    await expect(assertPublicURL('https://intranet.example/', dns({ 'intranet.example': '10.0.0.5' }))).rejects.toThrow('局域网')
    await expect(assertPublicURL('https://example.com/?k=Synthetic-Saved-Secret-123', publicDns)).rejects.toThrow('受保护')
    await expect(assertPublicURL('https://example.com/?k=sk-abcdefghijklmnopqrstuvwxyz', publicDns)).rejects.toThrow('受保护')
    expect((await assertPublicURL('https://example.com/docs?q=1', publicDns)).href).toBe('https://example.com/docs?q=1')
  })
  it('follows public redirects but stops a redirect into the local network', async () => {
    const fetcher = vi.fn(async (url: URL) => url.hostname === 'a.example' ? page('', { status: 302, headers: { location: 'https://b.example/final' } }) : page('<h1>ok</h1>'))
    const result = await webFetch('https://a.example/start', { fetcher, resolve: publicDns })
    expect(result).toMatchObject({ url: 'https://b.example/final', statusCode: 200, body: { kind: 'html', content: '<h1>ok</h1>' }, truncated: false })
    const evil = vi.fn(async () => page('', { status: 301, headers: { location: 'http://169.254.169.254/latest/meta-data' } }))
    await expect(webFetch('https://a.example/start', { fetcher: evil, resolve: publicDns })).rejects.toThrow('局域网')
    expect(evil).toHaveBeenCalledTimes(1)
  })
  it('caps the body, refuses binary content and decodes declared charsets', async () => {
    const big = await webFetch('https://example.com/', { fetcher: async () => page(new Uint8Array(WEB_LIMITS.maxBytes + 4096).fill(97), { type: 'text/plain' }), resolve: publicDns })
    expect(big.truncated).toBe(true); expect(big.body.content.length).toBe(WEB_LIMITS.maxBytes)
    await expect(webFetch('https://example.com/a.zip', { fetcher: async () => page('PK', { type: 'application/zip' }), resolve: publicDns })).rejects.toThrow('不支持的内容类型')
    const gbk = await webFetch('https://example.com/', { fetcher: async () => page(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]), { type: 'text/plain; charset=gbk' }), resolve: publicDns })
    expect(gbk.body.content).toBe('你好')
  })
})

describe('web search', () => {
  const rss = `<?xml version="1.0"?><rss><channel><title>必应</title>
    <item><title>Electron &amp; safeStorage</title><link>https://www.electronjs.org/docs/latest/api/safe-storage</link><description>Allows access to &lt;b&gt;simple&lt;/b&gt; encryption</description><pubDate>Mon, 26 Oct 2026 08:00:00 GMT</pubDate></item>
    <item><title>bad</title><link>javascript:alert(1)</link><description>x</description></item>
    <item><title><![CDATA[第二条]]></title><link>https://example.com/2</link><description>中文&#20869;容</description></item>
  </channel></rss>`
  it('parses Bing RSS items, drops non-web links and unescapes text', () => {
    expect(parseBingRss(rss, 5)).toEqual([
      { url: 'https://www.electronjs.org/docs/latest/api/safe-storage', title: 'Electron & safeStorage', snippet: 'Allows access to simple encryption', publishedAt: '2026-10-26T08:00:00.000Z' },
      { url: 'https://example.com/2', title: '第二条', snippet: '中文内容' }
    ])
  })
  it('queries Bing RSS with a bounded result count and refuses queries carrying secrets', async () => {
    const fetcher = vi.fn(async () => page(rss, { type: 'application/rss+xml; charset=utf-8' }))
    const result = await webSearch('electron safeStorage', 99, { fetcher })
    expect(result.sources).toHaveLength(2)
    const url = (fetcher.mock.calls[0] as unknown as [URL])[0]
    expect(url.hostname).toBe('www.bing.com'); expect(url.searchParams.get('format')).toBe('rss'); expect(url.searchParams.get('count')).toBe(String(WEB_LIMITS.maxResults))
    await expect(webSearch('token Synthetic-Saved-Secret-123', 3, { fetcher })).rejects.toThrow('受保护')
  })
})
