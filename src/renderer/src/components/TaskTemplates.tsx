import { useEffect, useState } from 'react'
import type { TaskTemplate } from '@/types/workbench'
import { unwrap } from '../hooks/useWorkbench'
import { useConfirm } from './ConfirmDialog'

export default function TaskTemplates({ prompt, acceptance, apply, act, busy }: {
  prompt: string; acceptance: string; apply: (item: TaskTemplate) => void; busy: boolean
  act: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>
}): JSX.Element {
  const [items, setItems] = useState<TaskTemplate[]>([]), [name, setName] = useState(''), [error, setError] = useState('')
  const confirm = useConfirm()
  useEffect(() => { if (window.api.workbench.templates) void unwrap(window.api.workbench.templates()).then(setItems).catch(() => setError('任务模板暂时无法读取')) }, [])
  return <details className="text-sm">
    <summary className="cursor-pointer text-muted-foreground">常用任务模板</summary>
    {error && <p role="alert">{error}</p>}
    <div className="my-2 flex flex-wrap gap-2">{items.map(item => <button type="button" disabled={busy} className="cv-btn cv-btn-secondary text-xs" key={item.id} onClick={() => apply(item)}>{item.name}</button>)}</div>
    <label className="block text-xs">保存当前目标为模板<input className="cv-input mt-1" aria-label="新模板名称" value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="例如：每次改动后的检查" /></label>
    <button type="button" className="cv-btn cv-btn-ghost mt-2 text-xs" disabled={busy || !name.trim() || !prompt.trim()} onClick={() => void act(async () => { const item = await unwrap(window.api.workbench.saveTemplate({ name, prompt, acceptance })); setItems([...items, item]); setName('') }, '任务模板已保存')}>保存模板</button>
    {items.some(item => !item.builtIn) && <details className="mt-2 text-xs"><summary className="cursor-pointer">管理自定义模板</summary>
      {items.filter(item => !item.builtIn).map(item => <div className="mt-2 flex items-center justify-between gap-2" key={item.id}><span className="break-all">{item.name}</span><button type="button" className="cv-btn cv-btn-ghost text-xs" disabled={busy} aria-label={`删除模板 ${item.name}`} onClick={() => void act(async () => {
        if (!await confirm({ title: '删除模板', message: `删除“${item.name}”？已经创建的任务会保留。`, confirmText: '确认删除', variant: 'danger' })) return
        await unwrap(window.api.workbench.deleteTemplate(item.id)); setItems(current => current.filter(value => value.id !== item.id))
      })}>删除</button></div>)}
    </details>}
  </details>
}
