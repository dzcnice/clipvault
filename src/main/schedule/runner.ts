import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
import { isUnlocked, onVaultLocked } from '../crypto/vault'
import { verifyRuntime, workerEnvironment } from '../workbench/runtime'
import { showNotification } from '../notification'
import { dueSchedules, nextDueAt, postponeSchedule, endSchedule, recordDelivery, type ScheduleEntry } from './store'

type Advance = { oneShot: Array<{ id: string; text: string }>; recurring: Array<{ id: string; occurrenceAt: string; nextScheduledAt: string | null }>; batch: string | null; failed: Array<{ id: string | null; message: string }> }
export type Deliver = (sessionId: string, text: string) => Promise<{ messageId: string }>
const RETRY_MS = 60_000, MAX_TIMER = 2 ** 31 - 1

/** Runs the official time rules in the bundled Harness runtime; the main process has no copy of them. */
async function advance(runtimeRoot: string, records: ScheduleEntry['record'][], now: number): Promise<Advance> {
  const manifest = await verifyRuntime(runtimeRoot)
  return new Promise((resolve, reject) => {
    const child = spawn(join(runtimeRoot, manifest.node), [join(runtimeRoot, 'schedule-worker.mjs')], { cwd: runtimeRoot, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: workerEnvironment(app.getPath('temp'), '', '') })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('提醒计算超时')) }, 10_000)
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk })
    child.stderr.resume(); child.stdin.on('error', () => {})
    child.once('error', () => { clearTimeout(timer); reject(new Error('提醒计算启动失败')) })
    child.once('exit', () => {
      clearTimeout(timer)
      try { const value = JSON.parse(output) as Advance & { error?: string }; if (value.error) throw new Error(value.error); resolve(value) } catch { reject(new Error('提醒计算失败')) }
    })
    child.stdin.end(JSON.stringify({ records, now }))
  })
}

/**
 * Host-side timer for reminders. Due reminders are delivered as a follow-up message into their
 * original session through the normal prompt path, so the usual per-turn send approval still applies.
 * Only the latest missed occurrence of a recurring reminder is delivered (official semantics).
 */
export class ScheduleRunner {
  private timer?: ReturnType<typeof setTimeout>
  private running = false
  private stopped = true
  private offLock?: () => void
  constructor(private readonly runtimeRoot: string, private readonly deliver: Deliver, private readonly exists: (sessionId: string) => boolean) {}
  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.offLock = onVaultLocked(() => this.stop())
    this.arm()
  }
  stop(): void { this.stopped = true; clearTimeout(this.timer); this.timer = undefined; this.offLock?.(); this.offLock = undefined }
  arm(): void {
    clearTimeout(this.timer); this.timer = undefined
    if (this.stopped || !isUnlocked()) return
    const next = nextDueAt()
    if (next === null) return
    this.timer = setTimeout(() => { void this.fire() }, Math.min(MAX_TIMER, Math.max(0, next - Date.now())))
    this.timer.unref?.()
  }
  async fire(now = Date.now()): Promise<void> {
    if (this.running || this.stopped || !isUnlocked()) return
    this.running = true
    try {
      const due = dueSchedules(now), sessions = new Map<string, ScheduleEntry[]>()
      for (const item of due) sessions.set(item.sessionId, [...sessions.get(item.sessionId) ?? [], item])
      for (const [sessionId, items] of sessions) {
        if (!this.exists(sessionId)) { items.forEach(item => endSchedule(item.id)); continue }
        let plan: Advance
        try { plan = await advance(this.runtimeRoot, items.map(item => item.record), now) } catch { items.forEach(item => postponeSchedule(item.id, now + RETRY_MS)); continue }
        for (const failure of plan.failed) if (failure.id) endSchedule(failure.id)
        const text = [...plan.oneShot.map(item => item.text), plan.batch].filter(Boolean).join('\n\n')
        if (!text) continue
        let messageId: string
        try { ({ messageId } = await this.deliver(sessionId, text)) }
        catch (error) {
          // A running/queued session or a locked vault: keep the reminder and retry; other errors end it.
          const message = error instanceof Error ? error.message : ''
          if (/正在运行|排队|解锁|关闭|锁定/.test(message)) items.forEach(item => postponeSchedule(item.id, Date.now() + RETRY_MS))
          else items.forEach(item => endSchedule(item.id))
          continue
        }
        const deliveredAt = new Date().toISOString()
        for (const item of items) {
          const shot = plan.oneShot.find(value => value.id === item.id), next = plan.recurring.find(value => value.id === item.id)
          if (shot) recordDelivery(item, { scheduledAt: item.record.scheduledAt, deliveredAt, messageId, prompt: item.record.prompt }, null)
          else if (next) recordDelivery(item, { scheduledAt: next.occurrenceAt, deliveredAt, messageId, prompt: item.record.prompt }, next.nextScheduledAt)
        }
        showNotification({ title: '提醒到了', body: items.map(item => item.record.title).join('、').slice(0, 120) + ' · 已发到原会话，确认后继续', silent: false })
      }
    } finally { this.running = false; this.arm() }
  }
}
