import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { boundedText } from './input'
import type { ModelConfig } from '../../types/workbench'
import { requestNetwork } from './network'
import { toOpenAI, fromOpenAI } from './model-protocol'
import { containsSecrets, redactOutboundValue } from './redaction'
import { forwardModelStream } from './model-stream'
import { expandImages, type VisionImage } from './vision'

export function endpointURL(value: string): URL {
  const url = new URL(boundedText(value, '服务地址', 2048, true))
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('服务地址须使用 HTTPS，且不能包含密码、查询参数或片段')
  return url
}
interface Options {
  model: ModelConfig; signal: AbortSignal
  modelKey: () => string
  secrets: () => string[]
  tool: (operation: string, args: Record<string, unknown>, scope?: { agentId?: unknown; planMode?: unknown }) => Promise<unknown>
  session?: (input: Record<string, unknown>) => unknown
  control?: (operation: string, input: Record<string, unknown>) => Promise<unknown>
  streaming?: boolean
  /** 识图：按 ID 取回本会话的图片；模型拒收图片时回调一次。 */
  images?: (id: string) => VisionImage | undefined
  onVisionFallback?: () => void
}
async function readBody(request: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) {
    body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    if (Buffer.byteLength(body) > 2_000_000) throw new Error('请求超过大小限制')
  }
  return body
}

/** 本机随机能力令牌只授权当前运行，真实密钥仅在此注入固定目标。 */
export async function createBridge(options: Options): Promise<{ url: string; token: string; close: () => Promise<void> }> {
  const token = randomBytes(32).toString('hex'), expected = Buffer.from(token)
  const endpoint = endpointURL(options.model.endpoint)
  let requests = 0
  const server = createServer((request, response) => { void handle(request, response) })
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const auth = String(request.headers.authorization ?? request.headers['x-api-key'] ?? '').replace(/^Bearer /, '')
      const provided = Buffer.from(auth)
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected) || request.headers.origin || request.method !== 'POST') { response.writeHead(403).end(); return }
      const body = await readBody(request)
      if (request.url === '/session' && options.session) {
        const input = JSON.parse(body) as Record<string, unknown>
        const result = options.session(input)
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(redactOutboundValue(result, options.secrets())))
        return
      }
      options.signal.throwIfAborted()
      if (request.url?.startsWith('/control/') && options.control) {
        const input = JSON.parse(body) as Record<string, unknown>
        const result = await options.control(request.url.slice('/control/'.length), input)
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(result))
        return
      }
      if (request.url === '/tool') {
        const data = JSON.parse(body) as { operation: string; args: Record<string, unknown>; scope?: { agentId?: unknown; planMode?: unknown } }
        if (typeof data.operation !== 'string' || !data.args || typeof data.args !== 'object' || Array.isArray(data.args)) throw new Error('工具参数无效')
        const result = await options.tool(data.operation, data.args, data.scope)
        options.signal.throwIfAborted()
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(redactOutboundValue(result, options.secrets())))
        return
      }
      if (request.url !== '/model/v1/messages') { response.writeHead(404).end(); return }
      if (++requests > options.model.maxRequests) throw new Error('本次模型请求额度已用完')
      if (containsSecrets(body, options.secrets())) throw new Error('模型请求包含受保护字段，已阻止发送')
      const data = JSON.parse(body) as Record<string, unknown>
      data.model = options.model.model
      const openAI = options.model.protocol === 'openai-chat'
      const url = new URL(`${endpoint.pathname.replace(/\/$/, '')}${openAI ? '/chat/completions' : '/v1/messages'}`, endpoint.origin)
      const headers: Record<string, string> = { 'content-type': 'application/json', ...(openAI ? { authorization: `Bearer ${options.modelKey()}` } : { 'x-api-key': options.modelKey(), 'anthropic-version': '2023-06-01' }) }
      const disconnected = new AbortController()
      response.once('close', () => disconnected.abort())
      const signal = AbortSignal.any([options.signal, disconnected.signal, AbortSignal.timeout(120_000)])
      const allowedTools = (data.tools as Array<{ name: string }> | undefined)?.map(tool => tool.name) ?? []
      const send = (payload: Record<string, unknown>): Promise<Response> => requestNetwork(url, { method: 'POST', redirect: 'error', signal, headers, body: JSON.stringify(openAI ? toOpenAI(payload, options.streaming === true) : payload) })
      const expanded = options.images && body.includes('[[图片:') ? expandImages(data, options.images) : { data, count: 0 }
      let upstream = await send(expanded.data)
      // 模型不支持识图时（通常 400/415/422），去掉图片、保留图片文字重试一次。
      if (expanded.count > 0 && [400, 415, 422].includes(upstream.status)) {
        await upstream.body?.cancel().catch(() => {})
        options.onVisionFallback?.()
        upstream = await send(expandImages(data, options.images!, false).data)
      }
      if (!upstream.ok || !upstream.body) throw new Error(`模型服务请求失败（HTTP ${upstream.status}）`)
      if (options.streaming && upstream.headers.get('content-type')?.includes('text/event-stream')) {
        await forwardModelStream(upstream, response, { openAI, model: options.model.model, allowedTools, secrets: options.secrets, signal })
        return
      }
      const reader = upstream.body.getReader()
      let bytes = 0, done = false
      const chunks: Uint8Array[] = []
      try {
        while (!done) {
          const chunk = await reader.read()
          done = chunk.done
          if (done || !chunk.value) break
          options.signal.throwIfAborted()
          bytes += chunk.value.length
          if (bytes > 8_000_000) throw new Error('模型响应过长')
          chunks.push(chunk.value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      const raw = Buffer.concat(chunks).toString('utf8')
      assertReplyHasNoSecrets(raw, options.secrets())
      const reply = openAI ? fromOpenAI(raw, options.model.model, allowedTools) : raw
      assertReplyHasNoSecrets(reply, options.secrets())
      response.writeHead(200, { 'content-type': openAI ? 'text/event-stream' : upstream.headers.get('content-type') ?? 'text/event-stream', 'cache-control': 'no-store' }).end(reply)
    } catch {
      // 上游响应和错误对象可能回显认证字段，不能直接转交给模型或日志。
      if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: '操作未完成：授权失效、目标不可用或达到本次运行限制' }))
      else response.destroy()
    }
  }
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('本机任务桥接启动失败')
  return { url: `http://127.0.0.1:${address.port}`, token, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}

/** 在交给 Harness 持久化之前检查完整响应，包括跨 SSE 分片回显的字段。 */
export function assertReplyHasNoSecrets(reply: string, secrets: string[]): void {
  let text = '', argumentsText = ''
  for (const line of reply.split('\n')) {
    if (!line.startsWith('data:')) continue
    try {
      const event = JSON.parse(line.slice(5))
      text += event.delta?.text ?? event.content_block?.text ?? ''
      argumentsText += event.delta?.partial_json ?? ''
    } catch { /* 非 JSON 控制事件 */ }
  }
  if (secrets.some(secret => secret && [reply, text, argumentsText].some(value => value.includes(secret) || value.includes(JSON.stringify(secret).slice(1, -1))))) throw new Error('模型响应包含受保护字段，已阻止进入会话')
}
