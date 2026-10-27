import { useEffect, useState } from 'react'

/** 保留策略只作用于临时历史，变更后在下次捕获新内容时执行。 */
export default function ClipboardRetention(): JSX.Element {
  const [days, setDays] = useState(0)
  const [imageDays, setImageDays] = useState(30)
  const [sizeMb, setSizeMb] = useState(0)
  const [maxCount, setMaxCount] = useState(500)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void window.api.prefs.get().then((res) => {
      if (cancelled) return
      if (!res.success || !res.data) throw new Error(res.error || '读取保留设置失败')
      setDays(res.data.historyRetentionDays ?? 0)
      setImageDays(res.data.imageRetentionDays ?? 30)
      setSizeMb(res.data.historyMaxSizeMb ?? 0)
      setMaxCount(res.data.maxHistorySize ?? 500)
      setReady(true)
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : '读取保留设置失败')
    })
    return () => { cancelled = true }
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await window.api.prefs.set({ historyRetentionDays: days, imageRetentionDays: imageDays, historyMaxSizeMb: sizeMb })
      if (!res.success) throw new Error(res.error || '保存失败')
      setMessage('已保存，下次捕获新内容时按此策略清理。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return <details className="mt-3 text-xs text-muted-foreground">
    <summary className="cursor-pointer">自动保留设置</summary>
    <form className="mt-2 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <label>历史天数 <input type="number" aria-label="历史保留天数" min={0} max={3650} required value={days} onChange={(e) => setDays(Number(e.target.value))} className="cv-input !w-24 !py-1" /></label>
      <label>图片天数 <input type="number" aria-label="图片保留天数" min={0} max={3650} required value={imageDays} onChange={(e) => setImageDays(Number(e.target.value))} className="cv-input !w-24 !py-1" /></label>
      <label>内容容量 MB <input type="number" aria-label="历史内容容量 MB" min={0} max={102400} required value={sizeMb} onChange={(e) => setSizeMb(Number(e.target.value))} className="cv-input !w-24 !py-1" /></label>
      <button type="submit" disabled={!ready || saving} className="cv-btn cv-btn-secondary">{saving ? '保存中…' : '保存保留设置'}</button>
    </form>
    <p className="mt-2">0 表示不限该项。临时历史最多 {maxCount} 条（可在设置中调整），图片同时受两种天数限制。容量按记录内容字节计算；置顶、长期保存和片段不参与自动清理。</p>
    {message ? <p role="status" className="mt-1">{message}</p> : null}
    {error ? <p role="alert" className="mt-1 text-destructive">{error}</p> : null}
  </details>
}
