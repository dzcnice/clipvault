import { X, Check, AlarmClock, CircleDot, Circle, FileCode2, ClipboardList, KeyRound, Paperclip, GitBranch } from 'lucide-react'
import type { SessionContext } from '@/types/session'

const icon = { size: 14, strokeWidth: 1.75 }
const Title = ({ children, count }: { children: React.ReactNode; count?: number }): JSX.Element =>
  <h2 className="mb-2.5 flex items-center justify-between text-xs text-[var(--ink-faint)]"><span>{children}</span>{count !== undefined && count > 0 && <span className="font-mono">{count}</span>}</h2>

function AdvancedContext({ context }: { context?: SessionContext }): JSX.Element {
  const phase: Record<string, string> = { active: '进行中', paused: '已暂停', blocked: '等待处理', complete: '已完成' }
  return <>
    <section><Title>目标与待办</Title>
      {context?.planMode && <p className="mb-2 rounded-[8px] bg-[var(--primary-soft)] px-2.5 py-1.5 text-[var(--blue)]">计划模式：仅分析，操作仍受权限约束。</p>}
      {context?.goal ? <div className="mb-3"><p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[var(--ink)]">{context.goal.objective}</p><p className="mt-1 text-[var(--ink-faint)]">{phase[context.goal.phase] ?? context.goal.phase} · 继续轮次 <span className="font-mono">{context.goal.roundsStarted}/{context.goal.maxGoalRounds}</span></p></div> : <p className="text-[var(--ink-faint)]">尚未设置持续目标</p>}
      {context?.todos?.length ? <ul className="mt-2 space-y-1.5">{context.todos.map((item, index) => <li key={index} className="flex items-start gap-2">
        <span className="mt-0.5" aria-label={item.status === 'completed' ? '已完成' : item.status === 'in_progress' ? '进行中' : '待处理'}>{item.status === 'completed' ? <span className="grid h-3.5 w-3.5 place-items-center rounded-[4px] bg-[var(--state-done)]"><Check size={10} strokeWidth={3} color="#fff" /></span> : item.status === 'in_progress' ? <CircleDot {...icon} className="text-[var(--blue)]" /> : <Circle {...icon} className="text-[var(--ink-faint)]" />}</span>
        <span className={`min-w-0 break-words ${item.status === 'completed' ? 'text-[var(--ink-faint)] line-through' : 'text-[var(--ink)]'}`}>{item.content}</span></li>)}</ul>
        : <p className="mt-2 text-[var(--ink-faint)]">助手处理多步骤工作时会在这里记录待办。</p>}
    </section>
    {!!context?.children?.length && <section><Title count={context.children.length}>子 Agent · 只读</Title>{context.children.map(child => <details key={child.id} className="group my-1.5 rounded-[10px] px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)]"><summary className="flex cursor-pointer list-none items-center gap-2 break-words"><GitBranch {...icon} />{child.title}<span className="ml-auto text-[var(--ink-faint)]">{child.state === 'completed' ? '完成' : child.state === 'aborted' ? '已停止' : child.state}</span></summary><p className="mt-2 whitespace-pre-wrap break-words text-[var(--ink-soft)]">{child.result || '尚无结果；原会话已保留。'}</p></details>)}</section>}
    {!!context?.compactions && <p className="text-[var(--ink-faint)]">历史已由 Harness 压缩 {context.compactions} 次，原事件仍加密保存。</p>}
  </>
}

/** Each side retains its original line numbers; no heuristic diff can hide an approved line. */
export function FileDifference({ before, after }: { before: string; after: string }): JSX.Element {
  return <div className="max-h-80 overflow-auto font-mono text-[12px] leading-[1.75]" aria-label="完整修改对比">
    {([['原文', before, 'var(--bad-soft)', 'var(--state-failed)', '−'], ['修改后', after, 'var(--ok-soft)', 'var(--state-done)', '+']] as const).map(([label, value, bg, color, sign]) => <div key={label}>
      <p className="sticky top-0 z-[1] border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-1.5 font-sans text-xs text-[var(--ink-faint)]">{label === '原文' ? '删除 / 原文' : '新增 / 修改后'}</p>
      {value.split('\n').map((line, index) => <div key={index} className="grid grid-cols-[44px_16px_minmax(0,1fr)] whitespace-pre-wrap break-all pr-4" style={{ background: bg }}>
        <span className="select-none pr-3 text-right text-[var(--ink-faint)]">{index + 1}</span><span className="select-none" style={{ color }}>{sign}</span><span style={{ color }}>{line || ' '}</span></div>)}
    </div>)}
  </div>
}

const KIND_LABEL: Record<string, string> = { after: '一次', at: '一次', every: '固定间隔', daily: '每天', weekly: '每周', cron: 'cron' }
function Schedules({ items, onDelete }: { items: NonNullable<SessionContext['schedules']>; onDelete?: (id: string) => void }): JSX.Element {
  return <section><Title count={items.filter(item => item.status === 'active').length}>定时提醒</Title>
    {items.map(item => <div key={item.id} className={`group my-1.5 rounded-[10px] px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)] ${item.status === 'inactive' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2"><AlarmClock {...icon} className={item.status === 'active' ? 'text-[var(--blue)]' : 'text-[var(--ink-faint)]'} /><span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">{item.title}</span>
        {onDelete && <button className="grid h-5 w-5 place-items-center rounded-[5px] text-[var(--ink-faint)] opacity-0 transition-opacity hover:bg-[var(--hover)] hover:text-[var(--destructive)] focus-visible:opacity-100 group-hover:opacity-100" aria-label={`删除提醒 ${item.title}`} onClick={() => onDelete(item.id)}><X size={12} /></button>}</div>
      <p className="mt-1 font-mono text-[11.5px] text-[var(--ink-faint)]">{KIND_LABEL[item.kind] ?? item.kind} · {item.status === 'active' ? '下次 ' + new Date(item.scheduledAt).toLocaleString() : '已结束'}</p>
      <p className="mt-1 line-clamp-2 break-words text-[var(--ink-soft)]">{item.prompt}</p>
    </div>)}
    <p className="mt-1.5 leading-relaxed text-[var(--ink-faint)]">到点后作为新消息发到本会话，仍需你批准发送。错过的周期提醒只补发最近一次。</p>
  </section>
}

export default function SessionContextPanel({ context, onClose, onDeleteSchedule }: { context?: SessionContext; onClose?: () => void; onDeleteSchedule?: (id: string) => void }): JSX.Element {
  return <aside className="cv-context flex min-h-0 animate-[cv-rise_.4s_cubic-bezier(.16,1,.3,1)] flex-col" aria-label="本会话上下文">
    <div className="flex h-11 shrink-0 items-center justify-between pl-4 pr-2"><span className="text-[13px] font-medium">本会话上下文</span>{onClose && <button className="cv-btn cv-btn-ghost !h-7 !px-1.5" aria-label="关闭上下文" onClick={onClose}><X {...icon} /></button>}</div>
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-2 text-[12.5px]">
      <AdvancedContext context={context} />
      {!!context?.schedules?.length && <Schedules items={context.schedules} onDelete={onDeleteSchedule} />}
      <section><Title count={(context?.mentions.length ?? 0) + (context?.attachments.length ?? 0)}>引用资料</Title>
        {context?.mentions.length ? context.mentions.map(item => <p key={`${item.kind}:${item.id}`} className="my-1 flex items-center gap-2 break-words rounded-[8px] px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--line)]">{item.kind === 'resource' ? <KeyRound {...icon} /> : item.kind === 'file' ? <FileCode2 {...icon} /> : <ClipboardList {...icon} />}<span className="min-w-0 flex-1 truncate">{item.label || item.id}</span>{item.kind === 'resource' && <span className="font-mono tracking-[.2em] text-[var(--ink-faint)]">••••</span>}</p>) : <p className="text-[var(--ink-faint)]">还没有引用资料</p>}
        {context?.attachments.map((name, index) => <p className="my-1 flex items-center gap-2 break-words rounded-[8px] px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--line)]" key={index}><Paperclip {...icon} />{name}</p>)}
      </section>
      <section><Title count={context?.changes.length}>改动文件</Title>{context?.changes.length ? context.changes.map((change, index) => <details className="my-1.5 overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--line)]" key={index}><summary className="cursor-pointer break-all px-2.5 py-2 font-mono">{change.path}</summary><FileDifference before={change.before} after={change.after} /></details>) : <p className="text-[var(--ink-faint)]">暂无已完成的文件改动</p>}</section>
      {!!context?.workspaceChanges?.length && <section><Title count={context.workspaceChanges.length}>工作区变更 · git 快照</Title>
        {context.workspaceChanges.map(turn => <details key={`${turn.turn}:${turn.at}`} className="group my-1.5 overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--line)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 [&::-webkit-details-marker]:hidden"><span>第 {turn.turn} 轮</span><span className="font-mono text-[var(--state-done)]">+{turn.added}</span><span className="font-mono text-[var(--state-failed)]">−{turn.deleted}</span><span className="ml-auto text-[var(--ink-faint)]">{turn.total} 个文件</span></summary>
          <div className="border-t border-[var(--line)]">{turn.files.map(file => <details key={file.path} className="border-b border-[var(--line)] last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 font-mono [&::-webkit-details-marker]:hidden"><span className="min-w-0 flex-1 truncate" title={file.display}>{file.display}</span>{file.binary ? <span className="text-[var(--ink-faint)]">二进制</span> : file.oversized ? <span className="text-[var(--ink-faint)]">过大</span> : <><span className="text-[var(--state-done)]">+{file.added}</span><span className="text-[var(--state-failed)]">−{file.deleted}</span></>}</summary>
            {file.hunks?.length ? <div className="max-h-64 overflow-auto bg-[var(--surface-2)] py-1 font-mono text-[11.5px] leading-[1.7]">{file.hunks.map((hunk, index) => <div key={index}>
              <p className="px-2.5 text-[var(--ink-faint)]">@@ −{hunk.oldStart} +{hunk.newStart}</p>
              {hunk.lines.map((line, row) => <p key={row} className="whitespace-pre-wrap break-all px-2.5" style={{ background: line.startsWith('+') ? 'var(--ok-soft)' : line.startsWith('-') ? 'var(--bad-soft)' : undefined, color: line.startsWith('+') ? 'var(--state-done)' : line.startsWith('-') ? 'var(--state-failed)' : undefined }}>{line || ' '}</p>)}
            </div>)}</div> : <p className="px-2.5 pb-2 text-[var(--ink-faint)]">{file.binary || file.oversized ? '不提供逐行对比' : '没有逐行对比'}</p>}
          </details>)}</div>
        </details>)}
        <p className="mt-1.5 leading-relaxed text-[var(--ink-faint)]">每轮开始与结束时的 git 快照对比，含你自己在本轮期间的改动；快照只在应用私有目录里临时存在，本轮结束即删除，这里保存的是脱敏后的差异。</p>
      </section>}
      <section><Title>本会话授权</Title>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5"><dt className="text-[var(--ink-faint)]">模型</dt><dd className="truncate text-right font-mono">{context?.model || '尚未配置'}</dd><dt className="text-[var(--ink-faint)]">权限</dt><dd className="text-right">{context?.permission === 'readonly' ? '只读' : context?.permission === 'project_auto' ? '自动修改项目文件' : '逐次确认'}</dd></dl>
        <p className="mt-2.5 leading-relaxed text-[var(--ink-faint)]">资源的取用按动作单独授权。模型无法读取密码和密钥值。</p>
      </section>
    </div>
  </aside>
}
