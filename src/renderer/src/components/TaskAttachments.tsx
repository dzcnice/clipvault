import type { ContextItem } from '@/types/workbench'
import { unwrap } from '../hooks/useWorkbench'

export default function TaskAttachments({ items, onChange, busy, act }: {
  items: ContextItem[]; onChange: (items: ContextItem[]) => void; busy: boolean
  act: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>
}): JSX.Element {
  return <section className="space-y-2" aria-label="任务附件">
    <button type="button" className="cv-btn cv-btn-secondary text-xs" disabled={busy || items.length >= 10} onClick={() => void act(async () => {
      const selected = await unwrap(window.api.workbench.chooseAttachments())
      onChange([...items, ...selected].slice(0, 10))
    })}>添加文件或图片</button>
    <p className="text-xs text-muted-foreground">文字保存为快照；图片先在本机识别文字。运行前会预览发送给模型的内容。</p>
    {items.map(item => <details className="rounded border border-[var(--line)] p-2 text-xs" key={item.id}>
      <summary className="cursor-pointer break-all">{item.title}{item.redacted ? ' · 已隐藏敏感字段' : ''}</summary>
      <pre className="my-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{item.text}</pre>
      <button type="button" className="cv-btn cv-btn-ghost text-xs" disabled={busy} onClick={() => onChange(items.filter(value => value.id !== item.id))}>移除此附件</button>
    </details>)}
  </section>
}
