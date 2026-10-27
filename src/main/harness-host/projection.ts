import type { UiEvent } from '../../types/session'
import { outboundRedact } from '../workbench/redaction'

type Event = { type?: string; data?: Record<string, unknown>; time?: number }
type Message = { content?: Array<{ type: string; text?: string }> }
type WithoutSeq<T> = T extends unknown ? Omit<T, 'seq'> : never
export function projectEvent(raw: unknown, seq: number, clean = outboundRedact): UiEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const event = raw as Event, data = event.data ?? {}, at = typeof event.time === 'number' ? event.time : Date.now()
  const text = (value: string): string => clean(value).text
  if (event.type === 'user/message' || event.type === 'assistant/message') {
    const message = (data.message ?? data) as Message | undefined
    const content = (message?.content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('')
    if (!content) return null
    return { seq, type: event.type === 'user/message' ? 'user_message' : 'assistant_message', text: text(content), at }
  }
  if (event.type === 'tool/call') {
    const call = data.call as { name?: string } | undefined
    const tool = text(String(call?.name ?? data.name ?? '工具'))
    return { seq, type: 'process', summary: `调用 ${tool}`, items: [{ tool, state: '进行中', callId: String(data.callId ?? '') }], at }
  }
  if (event.type === 'turn/error') return { seq, type: 'error', text: '本轮执行未完成，请检查模型设置或重新发送', at }
  return null
}

export class SessionProjection {
  private entries: UiEvent[] = []
  private next = 0
  private streams = new Map<string, string>()
  append(event: unknown): void {
    const raw = event as Event | null
    if (raw?.type === 'tool/result') {
      const result = raw.data?.message as { toolCallId?: string; isError?: boolean } | undefined
      const entry = [...this.entries].reverse().find(item => item.type === 'process' && item.items.some(call => call.callId === result?.toolCallId))
      if (entry?.type === 'process') {
        entry.items = entry.items.map(item => item.callId === result?.toolCallId ? { ...item, state: result?.isError ? '未完成' : '完成' } : item)
        entry.seq = this.next++
      }
      return
    }
    const projected = projectEvent(event, this.next)
    if (projected) {
      const last = this.entries.at(-1)
      if (projected.type === 'process' && last?.type === 'process') {
        last.items.push(...projected.items); last.summary = `执行 ${last.items.length} 项操作`; last.seq = this.next++
      } else { this.entries.push(projected); this.next++ }
    }
  }
  add(event: WithoutSeq<UiEvent>): void {
    this.entries.push({ ...event, seq: this.next++ } as UiEvent)
  }
  events(after: number): UiEvent[] { return this.entries.filter(event => event.seq > after) }
  stream(input: unknown): void {
    if (!input || typeof input !== 'object') return
    const frame = input as { type: string; attemptId: string; chunk?: { type: string; text?: string } }
    if (typeof frame.attemptId !== 'string' || frame.attemptId.length > 200) return
    if (frame.type === 'start') { this.streams.set(frame.attemptId, ''); return }
    this.entries = this.entries.filter(event => !('streamId' in event) || event.streamId !== frame.attemptId)
    if (frame.type === 'end') { this.streams.delete(frame.attemptId); return }
    if (frame.type !== 'chunk' || frame.chunk?.type !== 'text-delta' || typeof frame.chunk.text !== 'string') return
    const text = (this.streams.get(frame.attemptId) ?? '') + frame.chunk.text
    if (text.length > 1_000_000) return
    this.streams.set(frame.attemptId, text)
    this.entries.push({ seq: this.next++, type: 'assistant_message', streamId: frame.attemptId, text: outboundRedact(text).text, at: Date.now() })
  }
  clearStreams(): void {
    this.streams.clear(); this.entries = this.entries.filter(event => !('streamId' in event) || !event.streamId)
  }
  get seq(): number { return this.next - 1 }
}
