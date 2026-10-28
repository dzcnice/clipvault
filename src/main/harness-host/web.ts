import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { requestNetwork } from '../workbench/network'
import { boundedText } from '../workbench/input'
import { allResourceSecrets, containsSecrets, findBlockingSecret } from '../workbench/redaction'

/** 联网由主进程统一执行：Host 只拿到结果。 */
export const WEB_LIMITS = { maxBytes: 2 * 1024 * 1024, maxRedirects: 5, timeoutMs: 20_000, maxResults: 8 }
export interface WebSearchSource { url: string; title?: string; snippet?: string; publishedAt?: string }
export interface WebFetchResult { url: string; statusCode: number; body: { kind: 'html' | 'text'; content: string }; truncated: boolean }

/** 回环、私网、链路本地、组播、保留与运营商 NAT 地址一律不访问。 */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
  }
  if (family === 6) {
    const value = address.toLowerCase()
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isBlockedAddress(mapped[1]!)
    return value === '::' || value === '::1' || /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith('ff')
  }
  return true
}

function guardOutbound(value: string, label: string): void {
  if (findBlockingSecret(value) || containsSecrets(value, allResourceSecrets())) throw new Error(`${label}包含受保护的账号或密钥，已阻止联网`)
}

export async function assertPublicURL(raw: string, resolve: typeof lookup = lookup): Promise<URL> {
  const url = new URL(boundedText(raw, '网址', 4096, true))
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('只允许访问不含账号密码的 http(s) 网址')
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new Error('只允许常用网页端口')
  guardOutbound(url.href, '网址')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(host)) throw new Error('不访问本机或局域网地址')
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => isBlockedAddress(item.address))) throw new Error('不访问本机、局域网或保留地址')
  return url
}

async function readCapped(response: Response, signal: AbortSignal): Promise<{ bytes: Buffer; truncated: boolean }> {
  if (!response.body) return { bytes: Buffer.alloc(0), truncated: false }
  const reader = response.body.getReader(), chunks: Buffer[] = []
  let size = 0, truncated = false
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done || !value) break
      const room = WEB_LIMITS.maxBytes - size
      if (value.length > room) { chunks.push(Buffer.from(value.subarray(0, room))); truncated = true; break }
      chunks.push(Buffer.from(value)); size += value.length
    }
  } finally { await reader.cancel().catch(() => {}) }
  return { bytes: Buffer.concat(chunks), truncated }
}

function decode(bytes: Buffer, contentType: string): string {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString('latin1'))?.[1] ?? 'utf-8'
  try { return new TextDecoder(charset.toLowerCase()).decode(bytes) } catch { return new TextDecoder('utf-8').decode(bytes) }
}

type Fetcher = (url: URL, init: RequestInit) => Promise<Response>
interface WebDeps { fetcher?: Fetcher; resolve?: typeof lookup; signal?: AbortSignal }

export async function webFetch(raw: string, deps: WebDeps = {}): Promise<WebFetchResult> {
  const fetcher = deps.fetcher ?? ((url, init) => requestNetwork(url, init))
  const signal = AbortSignal.any([AbortSignal.timeout(WEB_LIMITS.timeoutMs), ...(deps.signal ? [deps.signal] : [])])
  let url = await assertPublicURL(raw, deps.resolve)
  for (let hop = 0; ; hop++) {
    const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClipVault-Jarvis/3.5', accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' } })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel().catch(() => {})
      if (hop >= WEB_LIMITS.maxRedirects) throw new Error('重定向次数过多')
      url = await assertPublicURL(new URL(response.headers.get('location')!, url).href, deps.resolve)
      continue
    }
    const type = response.headers.get('content-type') ?? ''
    if (type && !/text\/|json|xml|javascript/i.test(type)) { await response.body?.cancel().catch(() => {}); throw new Error(`不支持的内容类型：${type.split(';')[0]}`) }
    const { bytes, truncated } = await readCapped(response, signal)
    return { url: url.href, statusCode: response.status, body: { kind: /html/i.test(type) || (!type && /^\s*</.test(bytes.subarray(0, 64).toString())) ? 'html' : 'text', content: decode(bytes, type) }, truncated }
  }
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function unescapeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, code: string) => code.startsWith('#') ? String.fromCodePoint(parseInt(code.slice(code[1] === 'x' ? 2 : 1), code[1] === 'x' ? 16 : 10)) : entities[code.toLowerCase()] ?? all).replace(/<[^>]+>/g, '').trim()
}
export function parseBingRss(xml: string, limit: number): WebSearchSource[] {
  const sources: WebSearchSource[] = []
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (name: string): string | undefined => { const value = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(match[1]!)?.[1]; return value === undefined ? undefined : unescapeXml(value) }
    const link = tag('link')
    if (!link || !/^https?:\/\//.test(link)) continue
    const published = tag('pubDate'), date = published ? new Date(published) : undefined
    sources.push({ url: link, title: tag('title'), snippet: tag('description'), ...(date && !Number.isNaN(date.getTime()) ? { publishedAt: date.toISOString() } : {}) })
    if (sources.length >= limit) break
  }
  return sources
}

export async function webSearch(query: string, maxResults: number | undefined, deps: WebDeps = {}): Promise<{ sources: WebSearchSource[]; truncated: boolean }> {
  const text = boundedText(query, '搜索词', 500, true)
  guardOutbound(text, '搜索词')
  const limit = Math.min(WEB_LIMITS.maxResults, Math.max(1, Number.isInteger(maxResults) ? maxResults! : 6))
  const fetcher = deps.fetcher ?? ((url, init) => requestNetwork(url, init))
  const url = new URL('https://www.bing.com/search')
  url.search = new URLSearchParams({ q: text, format: 'rss', setlang: 'zh-CN', count: String(limit) }).toString()
  const signal = AbortSignal.any([AbortSignal.timeout(WEB_LIMITS.timeoutMs), ...(deps.signal ? [deps.signal] : [])])
  const response = await fetcher(url, { method: 'GET', redirect: 'error', signal, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClipVault-Jarvis/3.5', accept: 'application/rss+xml,text/xml' } })
  if (!response.ok) throw new Error(`搜索服务暂不可用（HTTP ${response.status}）`)
  const { bytes } = await readCapped(response, signal)
  const sources = parseBingRss(decode(bytes, response.headers.get('content-type') ?? ''), limit)
  return { sources, truncated: false }
}
