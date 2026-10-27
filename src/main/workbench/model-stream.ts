import type { ServerResponse } from 'node:http'
import { findBlockingSecret } from './redaction'

type Frame = Record<string, unknown>
interface Pending { frame: Frame; textEnd?: number; argsEnd?: number }
/** Retain a tail at least as long as every known secret; a split secret is rejected before any of its bytes leave the broker. */
export class SafeFrameQueue {
  private text = ''
  private args = ''
  private textLength = 0
  private argsLength = 0
  private queue: Pending[] = []
  constructor(private readonly secrets: () => string[], private readonly emit: (frame: Frame) => void) {}
  push(frame: Frame): void {
    const delta = frame.delta as { text?: string; thinking?: string; partial_json?: string } | undefined
    const block = frame.content_block as { text?: string; thinking?: string; input?: unknown } | undefined
    const text = delta?.text ?? delta?.thinking ?? block?.text ?? block?.thinking
    const args = delta?.partial_json ?? (block?.input && Object.keys(block.input).length ? JSON.stringify(block.input) : undefined)
    if (text) { this.text += text; this.textLength += text.length }
    if (args) { this.args += args; this.argsLength += args.length }
    const secrets = this.secrets()
    if ([JSON.stringify(frame), this.text, this.args].some(value => findBlockingSecret(value, secrets))) throw new Error('模型响应包含敏感内容')
    this.queue.push({ frame, ...(text ? { textEnd: this.textLength } : {}), ...(args ? { argsEnd: this.argsLength } : {}) })
    const pendingToken = Math.max(this.text.match(/\beyJ[A-Za-z0-9_.-]*$/)?.[0].length ?? 0, this.args.match(/\beyJ[A-Za-z0-9_.-]*$/)?.[0].length ?? 0)
    const hold = secrets.reduce((length, value) => Math.max(length, value.length, JSON.stringify(value).length), Math.max(512, pendingToken + 1))
    this.flush(frame.type === 'message_stop', hold)
    this.text = this.text.slice(-hold * 2); this.args = this.args.slice(-hold * 2)
  }
  private flush(final: boolean, hold: number): void {
    while (this.queue.length) {
      const item = this.queue[0]!
      if (!final && ((item.textEnd !== undefined && item.textEnd > this.textLength - hold) || (item.argsEnd !== undefined && item.argsEnd > this.argsLength - hold))) break
      this.queue.shift(); this.emit(item.frame)
    }
  }
}

/** Translate an OpenAI chunk stream using only tool names advertised in this exact model request. */
class OpenAIFrames {
  private started = false
  private textStarted = false
  private ended = false
  private calls = new Map<number, { id: string; name: string; args: string }>()
  constructor(private readonly model: string, private readonly allowedTools: string[], private readonly emit: (frame: Frame) => void) {}
  push(data: Frame): void {
    if (this.ended) return
    if (!this.started) {
      this.started = true
      this.emit({ type: 'message_start', message: { id: String(data.id ?? 'native-stream'), type: 'message', role: 'assistant', model: this.model, content: [], usage: { input_tokens: 0, output_tokens: 0 } } })
    }
    const choice = (data.choices as Array<{ delta?: { content?: string; refusal?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }> | undefined)?.[0]
    if (!choice) return
    if (choice.delta?.refusal) throw new Error('模型拒绝了本次请求')
    const text = choice.delta?.content
    if (text) {
      if (!this.textStarted) { this.textStarted = true; this.emit({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) }
      this.emit({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    }
    for (const delta of choice.delta?.tool_calls ?? []) {
      if (!Number.isSafeInteger(delta.index) || delta.index < 0 || delta.index > 64) throw new Error('模型工具序号无效')
      const call = this.calls.get(delta.index) ?? { id: '', name: '', args: '' }
      if (delta.id) call.id = delta.id
      call.name += delta.function?.name ?? ''; call.args += delta.function?.arguments ?? ''
      this.calls.set(delta.index, call)
    }
    if (!choice.finish_reason) return
    if (this.textStarted) this.emit({ type: 'content_block_stop', index: 0 })
    let index = this.textStarted ? 1 : 0
    for (const call of this.calls.values()) {
      if (!call.id || !this.allowedTools.includes(call.name)) throw new Error('模型返回了未授权工具')
      const input = JSON.parse(call.args)
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('工具参数无效')
      this.emit({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} } })
      this.emit({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } })
      this.emit({ type: 'content_block_stop', index }); index++
    }
    this.emit({ type: 'message_delta', delta: { stop_reason: this.calls.size ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn', stop_sequence: null }, usage: { output_tokens: Number((data.usage as { completion_tokens?: number } | undefined)?.completion_tokens) || 0 } })
    this.emit({ type: 'message_stop' }); this.ended = true
  }
}

export async function forwardModelStream(upstream: Response, response: ServerResponse, options: { openAI: boolean; model: string; allowedTools: string[]; secrets: () => string[]; signal: AbortSignal }): Promise<void> {
  if (!upstream.body) throw new Error('模型响应为空')
  let finished = false
  const safe = new SafeFrameQueue(options.secrets, frame => {
    if (!response.headersSent) response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
    response.write(`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
    if (frame.type === 'message_stop') finished = true
  })
  const converter = new OpenAIFrames(options.model, options.allowedTools, frame => safe.push(frame))
  const reader = upstream.body.getReader(), decoder = new TextDecoder()
  let buffer = '', bytes = 0
  const consume = (packet: string): void => {
    const data = packet.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return
    const frame = JSON.parse(data) as Frame
    if (options.openAI) converter.push(frame); else safe.push(frame)
  }
  try {
    let ended = false
    while (!ended) {
      options.signal.throwIfAborted()
      const chunk = await reader.read()
      ended = chunk.done
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > 8_000_000) throw new Error('模型响应超过大小限制')
      buffer += decoder.decode(chunk.value, { stream: true })
      let match: RegExpExecArray | null
      while ((match = /\r?\n\r?\n/.exec(buffer))) { consume(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length) }
    }
    buffer += decoder.decode()
    if (buffer.trim()) consume(buffer)
    if (!finished) throw new Error('模型流未完整结束')
    response.end()
  } finally { await reader.cancel().catch(() => {}) }
}
