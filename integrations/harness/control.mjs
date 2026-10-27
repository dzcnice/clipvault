import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

export const name = 'clipvault-control'
export const inject = ['agents', 'approval', 'userQuestions']

export function apply(ctx) {
  const lifetime = new AbortController()
  const sessionId = process.env.CV_SESSION_ID
  const headers = { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' }
  ctx.on('dispose', () => lifetime.abort())
  async function request(path, data, signal, timeout = 300_000) {
    const response = await fetch(`${process.env.CV_BRIDGE_URL}/control/${path}`, {
      method: 'POST', headers, body: JSON.stringify({ ...data, sessionId }),
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeout), ...(signal ? [signal] : [])])
    })
    if (!response.ok) throw new Error('控制请求不可用')
    return response.json()
  }
  ctx.on('approval/request', async (req) => {
    if (req.agent?.session.id !== sessionId) return 'unavailable'
    try {
      const result = await request('approval', { requestId: randomUUID(), tool: req.toolName, reason: req.reason, callId: req.callId }, req.signal)
      return result.decision === 'allow' ? 'allowed-once' : 'rejected'
    } catch { return req.signal?.aborted ? 'cancelled' : 'unavailable' }
  })
  ctx.on('user-questions/request', async (req) => {
    if (req.agent?.session.id !== sessionId) throw new Error('追问会话不匹配')
    return request('question', { requestId: randomUUID(), questions: req.questions, callId: req.wait?.callId }, req.signal)
  })
  let frames = Promise.resolve()
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (agent.session.id !== sessionId || (frame.type === 'chunk' && frame.chunk.type !== 'text-delta')) return
    // Ordered transient frames; persisted assistant/message remains the authoritative history.
    frames = frames.then(() => request('stream', { frame }, undefined, 30_000)).catch(() => {})
  })
  async function poll() {
    while (!lifetime.signal.aborted) {
      try {
        const command = await request('next', {}, undefined, 35_000)
        if (command.type === 'cancel') ctx.agents.get(sessionId)?.cancel({ kind: 'user' })
      } catch {
        if (!lifetime.signal.aborted) await delay(500, undefined, { signal: lifetime.signal }).catch(() => {})
      }
    }
  }
  void poll()
}
