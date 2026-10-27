import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { TaskState } from '@/types/workbench'

export const TASK_LABELS: Record<TaskState, string> = { draft: '草稿', queued: '排队中', running: '运行中', waiting: '待验收', verifying: '验证中', completed: '已完成', failed: '失败', interrupted: '已中断', stopping: '正在停止', stopped: '已停止' }
export function WorkbenchFrame({ title, description, error, loading, refresh, children, actions, flush }: { title: string; description: string; error: string; loading: boolean; refresh: () => Promise<void>; children: ReactNode; actions?: ReactNode; flush?: boolean }): JSX.Element {
  return <div className="flex h-full min-w-0 flex-col">
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line)] pl-6 pr-3">
      <h1 className="text-[14px] font-medium tracking-[-.01em]">{title}</h1>
      <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-faint)]">{description}</p>
      {actions}
      <button type="button" className="cv-btn cv-btn-ghost !px-2" onClick={() => void refresh()} aria-label="刷新工作台" title="刷新"><RefreshCw size={15} strokeWidth={1.75} /></button>
    </header>
    {error && <div role="alert" className="cv-pop mx-6 mt-4 rounded-[10px] bg-[var(--bad-soft)] px-4 py-2.5 text-[13px] text-[var(--destructive)]">{error}</div>}
    {loading ? <div role="status" className="cv-empty"><span className="cv-shimmer">正在读取本地资料…</span></div> : <div className={`min-h-0 flex-1 ${flush ? 'flex' : 'overflow-auto px-6 py-6'}`}>{children}</div>}
  </div>
}
export function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className="text-muted-foreground">{label}</span>{children}</label>
}
export function TaskBadge({ state }: { state: TaskState }): JSX.Element { return <span className={`cv-badge ${state === 'completed' ? 'cv-badge-accent' : ''}`}>{TASK_LABELS[state]}</span> }
