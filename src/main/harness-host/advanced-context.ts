import type { SessionContext } from '../../types/session'
import { readEncryptedSession, sessionReceipts } from '../../db/harness-session-store'
import { outboundRedact } from '../workbench/redaction'

/** UI projection only; lifecycle, validation and execution remain official Harness services. */
export function advancedContext(id: string): Pick<SessionContext, 'goal' | 'todos' | 'children' | 'compactions'> {
  let goal: SessionContext['goal'], todos: SessionContext['todos'] = [], compactions = 0
  for (const event of readEncryptedSession(id)?.events ?? []) {
    const data = event.data as Record<string, unknown> | undefined
    if (!data) continue
    if (event.type === 'goal/change') {
      const value = data.goal as { objective: string; phase: string; maxGoalRounds: number } | undefined
      goal = value ? { ...value, objective: outboundRedact(value.objective).text, roundsStarted: Number(data.roundsStarted ?? 0) } : undefined
    }
    if (event.type === 'todo/write' && Array.isArray(data.todos)) todos = (data.todos as NonNullable<SessionContext['todos']>).map(item => ({ ...item, content: outboundRedact(item.content).text }))
    const source = data.source as { kind?: string; round?: number } | undefined
    if (goal && event.type === 'user/message' && source?.kind === 'goal' && typeof source.round === 'number') goal.roundsStarted = source.round
    if (event.type === 'compaction/summary') compactions++
  }
  const children = sessionReceipts(id).filter(item => item.operation === 'child_session').map(item => {
    const events = readEncryptedSession(item.id)?.events ?? []
    const title = events.find(event => event.type === 'session/title')?.data as { title?: string } | undefined
    const end = events.filter(event => event.type === 'turn/end').at(-1)?.data as { reason?: { kind?: string } } | undefined
    const data = events.filter(event => event.type === 'assistant/message').at(-1)?.data as { message?: { content?: Array<{ type: string; text?: string }> } } | undefined
    const message = data?.message
    return { id: item.id, title: outboundRedact(title?.title || '只读分析').text, state: end?.reason?.kind ?? '运行中或已中断', result: outboundRedact(message?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '').text.slice(0, 8000) }
  })
  return { goal, todos, children, compactions }
}
