import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { ZodType } from 'zod'
import type { ModelConfig } from '../../types/workbench'
import * as store from '../../db/workbench-store'
import { createBridge } from '../workbench/bridge'
import { verifyRuntime, workerEnvironment } from '../workbench/runtime'
import { allResourceSecrets, outboundRedact } from '../workbench/redaction'
import { HostTransport } from './transport'

export interface StructuredRequest<T> { purpose: 'clipboard_query' | 'clipboard_organize' | 'resource_structure'; prompt: string; schema: ZodType<T>; timeoutMs: number }
export class ModelUnavailableError extends Error { constructor() { super('模型暂不可用，已保留本地结果'); this.name = 'ModelUnavailableError' } }

/** One utility Host at a time. Each call uses a fresh in-memory official session. */
export class UtilityHost {
  private tail: Promise<unknown> = Promise.resolve()
  private queued = 0
  private closing = false
  private controller?: AbortController
  get busy(): boolean { return this.queued > 0 }
  constructor(private readonly runtimeRoot: string, private readonly home: string, private readonly model: () => ModelConfig) {}
  structured<T>(request: StructuredRequest<T>): Promise<T> {
    if (this.closing || this.queued >= 10) return Promise.reject(new ModelUnavailableError())
    this.queued++
    const result = this.tail.catch(() => {}).then(() => this.run(request)).finally(() => { this.queued-- })
    this.tail = result
    return result
  }
  private async run<T>(request: StructuredRequest<T>): Promise<T> {
    if (this.closing) throw new ModelUnavailableError()
    const controller = new AbortController(); this.controller = controller
    let bridge: Awaited<ReturnType<typeof createBridge>> | undefined, transport: HostTransport | undefined
    let text = '', failed = false
    const timeout = setTimeout(() => controller.abort(), Math.min(120_000, Math.max(1000, request.timeoutMs)))
    try {
      const model = this.model(), version = store.getResource(model.resourceId!).version, manifest = await verifyRuntime(this.runtimeRoot)
      await mkdir(this.home, { recursive: true }); controller.signal.throwIfAborted()
      bridge = await createBridge({ model: { ...model, maxRequests: 1 }, signal: controller.signal, secrets: allResourceSecrets, modelKey: () => store.readResourceField(model.resourceId!, model.field, version), tool: async () => { throw new Error('工具型会话不允许工具') } })
      const id = randomUUID()
      transport = new HostTransport(this.runtimeRoot, manifest.node, this.home, { ...workerEnvironment(this.home, bridge.url, bridge.token), CV_SESSION_ID: id, CV_HARNESS_UTILITY: '1' }, value => {
        const message = value as { method?: string; params?: { sessionId?: string; event?: { type: string; data: Record<string, unknown> } } }
        const event = message.params?.event
        if (message.method !== 'session.event' || message.params?.sessionId !== id || !event) return
        if (event.type === 'assistant/message') {
          const content = ((event.data.message ?? event.data) as { content?: Array<{ type: string; text?: string }> }).content
          text += content?.filter(block => block.type === 'text').map(block => block.text ?? '').join('') ?? ''
        }
        if (event.type === 'turn/end' && (event.data.reason as { kind: string })?.kind !== 'completed') failed = true
      }, () => {})
      controller.signal.addEventListener('abort', () => { void transport?.close() }, { once: true })
      await transport.request({ type: 'initialize', directory: this.home, home: this.home, model: model.model })
      await transport.request({ method: 'session/prompt', params: { sessionId: id, contentBlocks: [{ type: 'text', text: outboundRedact(`只返回一个 JSON 对象，禁止工具调用。任务：${request.purpose}\n${request.prompt}`).text }] } })
      await transport.request({ method: 'session/wait', params: { sessionId: id } }, request.timeoutMs)
      controller.signal.throwIfAborted()
      if (failed || text.length > 100_000) throw new Error('结构化调用失败')
      return request.schema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')))
    } catch { throw new ModelUnavailableError() }
    finally { clearTimeout(timeout); controller.abort(); await transport?.close(); await bridge?.close(); if (this.controller === controller) this.controller = undefined }
  }
  async shutdown(): Promise<void> { this.closing = true; this.controller?.abort(); await this.tail.catch(() => {}) }
}
