import { useState } from 'react'
import type { ResourceInput, ResourceKind, WorkbenchSnapshot, WorkResource } from '@/types/workbench'
import { unwrap } from '../hooks/useWorkbench'
import { Field } from './WorkbenchParts'

export const RESOURCE_LABELS: Record<ResourceKind, string> = { account: '账号', api: 'API 密钥', database: '数据库', snippet: '片段', command: '命令', link: '链接', note: '笔记', model: '模型服务' }
type Act = <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>
interface Props {
  data: WorkbenchSnapshot; busy: boolean; act: Act; initial?: ResourceInput; initialText?: string
  onSaved?: (resource: WorkResource) => void; onCancel?: () => void; useForTask?: boolean
}
const blank = (): ResourceInput => ({ name: '', kind: 'account', projectId: null, environment: 'development', purpose: '', endpoint: '', fields: [] })
export default function ResourceEditor({ data, busy, act, initial, initialText = '', onSaved, onCancel, useForTask }: Props): JSX.Element {
  const [form, setForm] = useState<ResourceInput>(initial ?? blank()), [raw, setRaw] = useState(initialText)
  const [warnings, setWarnings] = useState<string[]>([]), [separateAccount, setSeparateAccount] = useState(false)
  const username = form.fields.find(field => /^(username|user|account|用户名|账号|email|邮箱)$/i.test(field.name))?.value
  const duplicates = form.id ? [] : data.resources.filter(resource => {
    if (resource.state === 'revoked') return false
    const sameAddress = form.endpoint && resource.endpoint && form.endpoint.replace(/\/$/, '') === resource.endpoint.replace(/\/$/, '')
    const sameName = form.name.trim() && resource.name.toLowerCase() === form.name.trim().toLowerCase()
    if (!sameAddress && !sameName) return false
    const existing = resource.fields.find(field => /^(username|user|account|用户名|账号|email|邮箱)$/i.test(field.name))?.displayValue
    return !username || !existing || username === existing
  })
  const parse = (): void => { void act(async () => {
    const draft = await unwrap(window.api.workbench.parseResource(raw)), suggested = draft.suggested
    const project = suggested?.projectName ? data.projects.find(project => project.name.toLocaleLowerCase() === suggested.projectName?.toLocaleLowerCase()) : undefined
    setForm(old => ({ ...old, fields: draft.fields, endpoint: draft.endpoint || old.endpoint, name: old.name || suggested?.name || '',
      kind: old.kind === 'model' ? old.kind : suggested?.kind ?? old.kind, purpose: old.purpose || suggested?.purpose || '',
      projectId: project?.id ?? old.projectId, environment: suggested?.environment || project?.environment || old.environment }))
    setWarnings([...draft.warnings, ...(suggested?.projectName && !project ? [`未找到项目“${suggested.projectName}”，请手动选择归属`] : [])])
    setSeparateAccount(false); setRaw('')
  }) }
  return <form className="cv-panel-soft space-y-4 p-5" onSubmit={event => {
    event.preventDefault()
    if (duplicates.length && !separateAccount) return
    void act(async () => { const resource = await unwrap(window.api.workbench.saveResource(form)); setForm(blank()); setRaw(''); setWarnings([]); setSeparateAccount(false); onSaved?.(resource) }, '资源已加密保存')
  }}>
    <h2 className="font-semibold">{form.id ? '编辑资源 · 未填写的旧字段保持原值' : '保存账号、密钥或工作资料'}</h2>
    <Field label="粘贴账号资料（只在本地整理）"><textarea rows={4} maxLength={100000} className="cv-input font-mono text-xs" autoComplete="off" spellCheck={false} value={raw} onChange={event => setRaw(event.target.value)} placeholder={'名称：测试后台\n项目：我的项目\n用户名：my-account\n密码：…\n用途：检查登录接口'} /></Field>
    <button type="button" className="cv-btn cv-btn-secondary" disabled={busy || !raw.trim()} onClick={parse}>整理字段</button>
    {warnings.map(warning => <p key={warning} role="status" className="text-xs text-muted-foreground">{warning}</p>)}
    <Field label="名称"><input required className="cv-input" maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：DeepSeek 编程模型" /></Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="类型"><select className="cv-input" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as ResourceKind })}>{Object.entries(RESOURCE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
      <Field label="项目"><select className="cv-input" value={form.projectId ?? ''} onChange={event => { const project = data.projects.find(project => project.id === event.target.value); setForm({ ...form, projectId: project?.id ?? null, environment: project?.environment ?? form.environment }) }}><option value="">通用资料</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
    </div>
    <Field label="环境"><input required className="cv-input" maxLength={40} value={form.environment} onChange={event => setForm({ ...form, environment: event.target.value })} /></Field>
    <Field label="地址"><input className="cv-input" type="url" maxLength={2048} value={form.endpoint} onChange={event => setForm({ ...form, endpoint: event.target.value })} placeholder={form.kind === 'model' ? 'https://api.deepseek.com/anthropic' : 'https://…'} /></Field>
    <Field label="用途 / 下次要做什么"><textarea className="cv-input" rows={2} maxLength={4000} value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} placeholder="用于哪个项目、登录哪里、下一次要做什么？" /></Field>
    <fieldset className="space-y-3"><legend className="mb-2 text-sm text-muted-foreground">字段{form.id ? '（同名字段保存为新版本）' : ''}</legend>
      {form.fields.map((field, index) => <div key={index} className="space-y-2 rounded border border-[var(--line)] p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <input required aria-label={`字段 ${index + 1} 名称`} className="cv-input" maxLength={64} value={field.name} placeholder="username / password / key" onChange={event => setForm({ ...form, fields: form.fields.map((item, at) => at === index ? { ...item, name: event.target.value } : item) })} />
          <input required aria-label={`字段 ${index + 1} 内容`} className="cv-input font-mono" type={field.secret ? 'password' : 'text'} autoComplete="off" value={field.value} onChange={event => setForm({ ...form, fields: form.fields.map((item, at) => at === index ? { ...item, value: event.target.value } : item) })} />
        </div>
        <div className="flex items-center justify-between text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={field.secret} onChange={event => setForm({ ...form, fields: form.fields.map((item, at) => at === index ? { ...item, secret: event.target.checked } : item) })} />敏感字段</label><button type="button" className="cv-btn cv-btn-ghost text-xs" onClick={() => setForm({ ...form, fields: form.fields.filter((_, at) => at !== index) })}>移除此草稿字段</button></div>
      </div>)}
      <button type="button" className="cv-btn cv-btn-secondary text-xs" disabled={form.fields.length >= 30} onClick={() => setForm({ ...form, fields: [...form.fields, { name: '', value: '', secret: true }] })}>添加字段</button>
    </fieldset>
    {duplicates.length > 0 && <div className="space-y-2 rounded border border-primary p-3" role="region" aria-label="可能已有的资源">
      <p className="text-sm">找到相同名称或地址的资源，请选择更新或另存账号。</p>
      {duplicates.map(resource => <div key={resource.id} className="text-xs"><p>{resource.name} · {resource.environment} · {data.projects.find(project => project.id === resource.projectId)?.name || '通用资料'}</p><button type="button" className="cv-btn cv-btn-secondary mt-1 text-xs" onClick={() => { setForm({ ...resource, expectedVersion: resource.version, fields: form.fields, purpose: form.purpose || resource.purpose }); setSeparateAccount(false) }}>更新这份资源</button></div>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={separateAccount} onChange={event => setSeparateAccount(event.target.checked)} />另存为独立账号</label>
    </div>}
    <div className="flex flex-wrap gap-2"><button className="cv-btn cv-btn-primary" disabled={busy || !!raw.trim() || (!form.id && !form.fields.length && !form.endpoint) || (!!duplicates.length && !separateAccount)}>{useForTask ? '保存并带入任务' : '保存资源'}</button>{onCancel && <button type="button" className="cv-btn cv-btn-secondary" onClick={onCancel}>取消</button>}</div>
    {raw.trim() && <p className="text-xs text-muted-foreground">先整理并核对字段，再保存原始资料。</p>}
  </form>
}
