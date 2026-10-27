import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SessionSearchResult } from '@/types/session'

export default function SessionHistoryPage(): JSX.Element {
  const [query, setQuery] = useState(''), [result, setResult] = useState<SessionSearchResult>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function search(): Promise<void> {
    if (busy || !query.trim()) return
    setBusy(true); setError(''); setResult(undefined)
    try { setResult(await window.sessionAPI.search(query)) } catch (error) { setError(error instanceof Error ? error.message : '搜索失败') } finally { setBusy(false) }
  }
  return <div className="h-full overflow-auto p-5"><h1 className="text-lg font-medium">搜索会话历史</h1><p className="mt-2 text-sm text-muted-foreground">使用本机 Harness 全文索引匹配词语或短语，不调用模型。索引仅在内存中，搜索后释放。</p><form className="my-5 flex max-w-2xl gap-2" onSubmit={event => { event.preventDefault(); void search() }}><input aria-label="搜索会话" className="cv-input" value={query} maxLength={300} onChange={event => setQuery(event.target.value)} placeholder="输入曾讨论过的词语或短语" /><button className="cv-btn cv-btn-primary shrink-0" disabled={busy || !query.trim()}>{busy ? '正在搜索…' : '搜索'}</button></form>{error && <p role="alert" className="text-sm">{error}</p>}{result && <><p className="text-xs text-muted-foreground">已检索 {result.searched}/{result.total} 个会话 · 每次最多索引最近 200 个会话、24 MB 脱敏历史。没有完整事件的空会话不纳入索引。</p>{result.items.length ? <ul className="mt-4 max-w-3xl divide-y">{result.items.map(item => <li key={item.id}><Link to={'/sessions/' + item.id} className="block py-4 hover:bg-muted"><h2 className="text-sm font-medium">{item.title}</h2><p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.snippet}</p></Link></li>)}</ul> : <p className="mt-5 text-sm">没有找到匹配会话，试试完整词语或更短的短语。</p>}</>}<Link to="/legacy-tasks" className="mt-8 inline-block text-sm underline">查看 3.4 只读历史任务</Link></div>
}
