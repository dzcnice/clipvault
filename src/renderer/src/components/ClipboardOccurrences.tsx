import { useEffect, useState } from 'react'
import type { ClipboardItem, ClipboardOccurrence } from '@/types'

export default function ClipboardOccurrences({ item }: { item: ClipboardItem }): JSX.Element {
  const [open, setOpen] = useState(false)
  const key = `${item.id}:${item.copyCount}`
  const [result, setResult] = useState<{ key: string; rows: ClipboardOccurrence[]; error: string } | null>(null)
  const loading = result?.key !== key
  const rows = loading ? [] : result!.rows
  const error = loading ? '' : result!.error
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.api.clipboard.getOccurrences(item.id).then((res) => {
      if (cancelled) return
      if (!res.success) throw new Error(res.error || '读取记录失败')
      setResult({ key, rows: res.data ?? [], error: '' })
    }).catch((err: unknown) => {
      if (!cancelled) setResult({ key, rows: [], error: err instanceof Error ? err.message : '读取记录失败' })
    })
    return () => { cancelled = true }
  }, [open, item.id, key])
  return <details className="mt-1 text-[11px] text-muted-foreground" onDoubleClick={(e) => e.stopPropagation()} onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer">已记录 {item.copyCount ?? 1} 次复制 · 时间与来源</summary>
    {open ? <div>
    <p>{item.firstSeenKnown ? `首次记录：${new Date(item.createdAt).toLocaleString()}` : '旧版本未保留首次复制时间，次数从升级时已有的一条记录起计。'}</p>
    {loading ? <p role="status">加载中…</p> : error ? <p role="alert">{error}</p> : <ul className="max-h-32 overflow-y-auto">
      {rows.map((row) => <li key={row.id}>{new Date(row.copiedAt).toLocaleString()} · {row.sourceApp || '未知来源'}{row.isMigration ? '（旧记录）' : ''}</li>)}
    </ul>}
    {!loading && !error && rows.length === 0 ? <p>暂无记录</p> : null}
    <p>展示最近 50 次已捕获的变化。</p>
    </div> : null}
  </details>
}
