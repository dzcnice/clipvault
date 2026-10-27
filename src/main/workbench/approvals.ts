import { randomUUID } from 'node:crypto'
import type { WorkApproval } from '../../types/workbench'
import { fingerprint } from './input'

interface Pending { approval: WorkApproval; settle: (allowed: boolean) => void }
/** 审批只绑定一个动作指纹；取消、过期、换任务后的回答不能复用。 */
export class WorkApprovals {
  private pending = new Map<string, Pending>()
  constructor(private readonly changed: () => void) {}
  list(): WorkApproval[] { return [...this.pending.values()].map(entry => ({ ...entry.approval })) }
  async request(input: Omit<WorkApproval, 'id' | 'expiresAt' | 'fingerprint'>, payload: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const approval: WorkApproval = { ...input, id: randomUUID(), fingerprint: fingerprint(JSON.stringify(payload)), expiresAt: Date.now() + 5 * 60_000 }
    const allowed = await new Promise<boolean>(resolve => {
      const settle = (value: boolean): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        this.pending.delete(approval.id)
        this.changed()
        resolve(value)
      }
      const abort = (): void => settle(false)
      const timer = setTimeout(() => settle(false), approval.expiresAt - Date.now())
      timer.unref()
      this.pending.set(approval.id, { approval, settle })
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else this.changed()
    })
    signal.throwIfAborted()
    if (!allowed) throw new Error('操作未获批准或审批已过期')
  }
  respond(id: string, hash: string, allowed: boolean): void {
    const entry = this.pending.get(id)
    if (!entry || entry.approval.fingerprint !== hash || entry.approval.expiresAt <= Date.now()) throw new Error('审批已失效，请以当前任务中的请求为准')
    entry.settle(allowed === true)
  }
  cancelRun(runId: string): void {
    for (const entry of [...this.pending.values()]) if (entry.approval.runId === runId) entry.settle(false)
  }
}
