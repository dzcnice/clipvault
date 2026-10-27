import { useEffect, useMemo, useState } from 'react'
import type { ModelOption, ModelServiceInput, ModelServiceStatus } from '@/types/workbench'
import { Field } from './WorkbenchParts'

type Protocol = ModelServiceInput['protocol']
const unwrap = async <T,>(promise: Promise<{ success: boolean; data?: T; error?: string }>): Promise<T> => {
  const result = await promise
  if (!result.success) throw new Error(result.error || '操作失败')
  return result.data as T
}
const originOf = (value: string): string => { try { return new URL(value).origin } catch { return '' } }

/** 自定义模型服务：地址 → 密钥 → 拉取并选择模型。密钥只发往主进程，不会回显。 */
export default function ModelSettings({ onSaved }: { onSaved?: (status: ModelServiceStatus) => void }): JSX.Element {
  const [status, setStatus] = useState<ModelServiceStatus | null>(null)
  const [endpoint, setEndpoint] = useState(''), [protocol, setProtocol] = useState<Protocol>('openai-chat')
  const [apiKey, setApiKey] = useState(''), [model, setModel] = useState('')
  const [maxRequests, setMaxRequests] = useState(30), [maxMinutes, setMaxMinutes] = useState(20)
  const [options, setOptions] = useState<ModelOption[]>([]), [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = (value: ModelServiceStatus): void => {
    setStatus(value); setEndpoint(value.endpoint); setProtocol(value.protocol); setModel(value.model)
    setMaxRequests(value.maxRequests); setMaxMinutes(value.maxMinutes); setApiKey('')
  }
  useEffect(() => { void unwrap(window.api.workbench.modelService()).then(load).catch(error => setMessage({ tone: 'error', text: error.message })) }, [])

  const keyReusable = !!status?.configured && status.keyConfigured && originOf(endpoint) === originOf(status.endpoint)
  const visible = useMemo(() => options.filter(option => option.id.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 200), [options, filter])
  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true); setMessage(null)
    try { await task() } catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : '操作失败' }) } finally { setBusy(false) }
  }
  const fetchModels = (): Promise<void> => run(async () => {
    const list = await unwrap(window.api.workbench.listModels({ endpoint: endpoint.trim(), protocol, ...(apiKey ? { apiKey } : {}) }))
    setOptions(list); setFilter('')
    if (!model && list[0]) setModel(list[0].id)
    setMessage({ tone: 'ok', text: `找到 ${list.length} 个模型` })
  })
  const save = (): Promise<void> => run(async () => {
    const saved = await unwrap(window.api.workbench.saveModelService({ endpoint: endpoint.trim(), protocol, model: model.trim(), maxRequests, maxMinutes, ...(apiKey ? { apiKey } : {}) }))
    load(saved); setMessage({ tone: 'ok', text: '模型服务已保存' }); onSaved?.(saved)
  })

  return <form className="cv-panel-soft space-y-4 p-5" onSubmit={event => { event.preventDefault(); void save() }}>
    <div>
      <h2 className="font-semibold">模型服务</h2>
      <p className="text-xs text-muted-foreground">任意 OpenAI 或 Anthropic 兼容服务。密钥加密保存在本机，由主进程代为发送，界面和模型都拿不到。</p>
    </div>
    <Field label="服务地址"><input className="cv-input font-mono" type="url" required placeholder="https://caowo.fun/v1" value={endpoint} onChange={event => { setEndpoint(event.target.value); setOptions([]) }} /></Field>
    <div className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground" id="model-protocol-label">接口协议</span>
      <div className="flex gap-2" role="radiogroup" aria-labelledby="model-protocol-label">
        {([['openai-chat', 'OpenAI 兼容'], ['anthropic', 'Anthropic 兼容']] as const).map(([value, label]) =>
          <button key={value} type="button" role="radio" aria-checked={protocol === value} className={`cv-btn ${protocol === value ? 'cv-btn-primary' : 'cv-btn-secondary'}`} onClick={() => { setProtocol(value); setOptions([]) }}>{label}</button>)}
      </div>
    </div>
    <Field label="密钥">
      <input className="cv-input font-mono" type="password" autoComplete="off" spellCheck={false} required={!keyReusable}
        placeholder={keyReusable ? '已保存 · 留空则继续使用' : status?.configured ? '服务地址已更换，请填写这个服务的密钥' : '粘贴这个服务的 API Key'}
        value={apiKey} onChange={event => setApiKey(event.target.value)} />
    </Field>
    <div className="flex min-w-0 flex-col gap-1.5 text-sm">
      <label className="text-muted-foreground" htmlFor="model-service-model">模型</label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input id="model-service-model" className="cv-input font-mono" required placeholder="选择或手动填写模型名称" value={model} onChange={event => setModel(event.target.value)} />
          <button type="button" className="cv-btn cv-btn-secondary shrink-0" disabled={busy || !endpoint || (!apiKey && !keyReusable)} onClick={() => void fetchModels()}>获取模型列表</button>
        </div>
        {options.length > 0 && <div className="rounded-md border">
          <input className="cv-input rounded-b-none border-0 border-b" placeholder={`在 ${options.length} 个模型中筛选`} value={filter} onChange={event => setFilter(event.target.value)} aria-label="筛选模型" />
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-label="可用模型">
            {visible.map(option => <li key={option.id}>
              <button type="button" role="option" aria-selected={option.id === model} className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs hover:bg-muted ${option.id === model ? 'bg-muted font-semibold' : ''}`} onClick={() => setModel(option.id)}>
                <span className="truncate">{option.id}</span>{option.owner && <span className="ml-3 shrink-0 text-muted-foreground">{option.owner}</span>}
              </button>
            </li>)}
            {!visible.length && <li className="px-3 py-2 text-xs text-muted-foreground">没有匹配的模型</li>}
          </ul>
        </div>}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Field label="每轮最多请求"><input className="cv-input" type="number" min={1} max={200} value={maxRequests} onChange={event => setMaxRequests(Number(event.target.value))} /></Field>
      <Field label="每轮最多分钟"><input className="cv-input" type="number" min={1} max={120} value={maxMinutes} onChange={event => setMaxMinutes(Number(event.target.value))} /></Field>
    </div>
    {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${message.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
    <button className="cv-btn cv-btn-primary" disabled={busy || !endpoint || !model || (!apiKey && !keyReusable)}>保存模型服务</button>
  </form>
}
