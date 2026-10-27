import { useEffect, useRef, useState } from 'react'
import type { IntakeReview, IntakeSource } from '@/types/resources'
import type { FieldRole, ResourceKind, WorkProject, WorkResource } from '@/types/workbench'
import { unwrap } from '../hooks/useWorkbench'
import { RESOURCE_LABELS } from './ResourceEditor'

const roleNames: Record<FieldRole, string> = { username: '用户名', password: '密码', api_key: 'API 密钥', token: '令牌', totp_seed: '验证码种子', host: '主机', port: '端口', database: '数据库', connection_string: '连接串', other: '其他' }
export default function ResourceIntake({ source = {}, onSaved, onCancel, sendAfter = false }: { source?: IntakeSource; onSaved: (resource: WorkResource) => void; onCancel?: () => void; sendAfter?: boolean }): JSX.Element {
  const [raw, setRaw] = useState(source.text ?? ''), [purpose, setPurpose] = useState(source.purpose ?? ''), [useAI, setUseAI] = useState(false)
  const [review, setReview] = useState<IntakeReview>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const organize = async (): Promise<void> => {
    setBusy(true); setError('')
    try { setReview(await unwrap(window.api.workbench.intake({ ...source, text: raw, purpose, useAI }))); setRaw('') }
    catch (error) { setError(error instanceof Error ? error.message : '整理失败') }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-xl border p-4" aria-label="资源录入">
    <h2 className="font-medium">{review ? '核对资源' : '保存账号与密钥'}</h2>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {review ? <ReviewForm initial={review} sendAfter={sendAfter} onSaved={resource => { setReview(undefined); setPurpose(''); onSaved(resource) }} onCancel={() => setReview(undefined)} /> : <>
      {source.clipboardId || source.promptId ? <p className="text-sm text-muted-foreground">已选择本机资料 · ••••••••</p> : <label className="block text-sm">账号资料<textarea className="cv-input mt-1 font-mono" rows={5} autoComplete="off" spellCheck={false} maxLength={100000} value={raw} onChange={event => setRaw(event.target.value)} placeholder="粘贴账号、密码、密钥，什么格式都行" /></label>}
      <label className="block text-sm">这是做什么用的？<input autoFocus={!!source.clipboardId || !!source.promptId || sendAfter} className="cv-input mt-1" value={purpose} maxLength={4000} onChange={event => setPurpose(event.target.value)} placeholder="例如：测试环境的支付后台，下次登录排查问题" /></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useAI} onChange={event => setUseAI(event.target.checked)} />让 AI 整理名称与用途（只发送字段格式，不发送值）</label>
      <div className="flex gap-2"><button className="cv-btn cv-btn-primary" disabled={busy || (!raw.trim() && !source.clipboardId && !source.promptId)} onClick={() => void organize()}>{busy ? '正在整理…' : '整理'}</button>{onCancel && <button className="cv-btn cv-btn-secondary" onClick={onCancel}>取消</button>}</div>
    </>}
  </section>
}
function ReviewForm({ initial, onSaved, onCancel, sendAfter }: { initial: IntakeReview; onSaved: (resource: WorkResource) => void; onCancel: () => void; sendAfter: boolean }): JSX.Element {
  const [draft, setDraft] = useState(initial.draft), [projects, setProjects] = useState<WorkProject[]>([])
  const [aliases, setAliases] = useState(initial.draft.aliases?.join(', ') ?? ''), [tags, setTags] = useState(initial.draft.tags?.join(', ') ?? '')
  const [choice, setChoice] = useState(initial.duplicates.length ? '?' : ''), [clearSource, setClearSource] = useState(true)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [revealed, setRevealed] = useState<Record<string, string>>({})
  const held = useRef('')
  useEffect(() => { void window.api.workbench.quickIndex().then(result => { if (result.success && result.data) setProjects(result.data.projects) }).catch(() => setError('项目列表暂时不可用')); return () => { held.current = '' } }, [])
  const hide = (): void => { held.current = ''; setRevealed({}) }
  const reveal = async (token: string): Promise<void> => { held.current = token; try { const text = await unwrap(window.api.workbench.revealIntake(initial.id, token)); if (held.current === token) setRevealed({ [token]: text }) } catch { hide(); setError('字段暂时不可查看') } }
  const save = async (): Promise<void> => {
    setBusy(true); setError(''); hide()
    try { const duplicate = initial.duplicates.find(item => item.id === choice); const labels = (value: string): string[] => value.split(/[,，]/).map(s => s.trim()).filter(Boolean); const resource = await unwrap(window.api.workbench.saveIntake({ id: initial.id, draft: { ...draft, aliases: labels(aliases), tags: labels(tags) }, updateId: duplicate?.id, expectedVersion: duplicate?.version, clearSource })); onSaved(resource) }
    catch (error) { setError(error instanceof Error ? error.message : '保存失败') }
    finally { setBusy(false) }
  }
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save() }}>
    <p className="text-xs text-muted-foreground">{initial.usernameShared ? '按你的设置，用户名参与了 AI 命名；密码、密钥与验证码种子未发送。' : initial.usedAI ? 'AI 只看到了字段的格式，没有看到值。' : '已采用本地解析；AI 整理如有尝试，仅发送了字段格式。'}</p>
    {initial.warnings.map((warning, index) => <p className="text-xs text-muted-foreground" key={index}>{warning}</p>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <label className="block text-sm">名称<input required className="cv-input mt-1" maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">类型<select className="cv-input mt-1" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as ResourceKind })}>{Object.entries(RESOURCE_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><label className="text-sm">项目<select className="cv-input mt-1" value={draft.projectId ?? ''} onChange={event => { const project = projects.find(item => item.id === event.target.value); setDraft({ ...draft, projectId: project?.id ?? null, environment: project?.environment ?? draft.environment }) }}><option value="">通用资料</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <label className="block text-sm">环境<input className="cv-input mt-1" required value={draft.environment} onChange={event => setDraft({ ...draft, environment: event.target.value })} /></label>
    <label className="block text-sm">用途<textarea className="cv-input mt-1" rows={2} value={draft.purpose ?? ''} onChange={event => setDraft({ ...draft, purpose: event.target.value })} /></label>
    <label className="block text-sm">服务地址<input className="cv-input mt-1" type="url" value={draft.endpoint ?? ''} onChange={event => setDraft({ ...draft, endpoint: event.target.value })} /></label>
    <label className="block text-sm">登录地址<input className="cv-input mt-1" type="url" value={draft.loginUrl ?? ''} onChange={event => setDraft({ ...draft, loginUrl: event.target.value })} /></label>
    <label className="block text-sm">别名（逗号分隔）<input className="cv-input mt-1" value={aliases} onChange={event => setAliases(event.target.value)} /></label>
    <label className="block text-sm">标签（逗号分隔）<input className="cv-input mt-1" value={tags} onChange={event => setTags(event.target.value)} /></label>
    <label className="block text-sm">轮换周期（天，可选）<input className="cv-input mt-1" type="number" min={1} max={3650} value={draft.rotateAfterDays ?? ''} onChange={event => setDraft({ ...draft, rotateAfterDays: event.target.value ? Number(event.target.value) : undefined })} /></label>
    <fieldset className="space-y-2"><legend className="text-sm">字段 · 按住显示检查原值</legend>{draft.fields.map((field, index) => <div className="space-y-2 border-b py-2" key={field.token}><div className="grid gap-2 sm:grid-cols-2"><input aria-label={`字段 ${index + 1} 名称`} className="cv-input" value={field.name} onChange={event => setDraft({ ...draft, fields: draft.fields.map(item => item.token === field.token ? { ...item, name: event.target.value } : item) })} /><select aria-label={`字段 ${index + 1} 角色`} className="cv-input" value={field.role} onChange={event => setDraft({ ...draft, fields: draft.fields.map(item => item.token === field.token ? { ...item, role: event.target.value as FieldRole } : item) })}>{Object.entries(roleNames).map(([role, label]) => <option value={role} key={role}>{label}</option>)}</select></div><div className="flex items-center gap-3"><span className="min-w-0 flex-1 break-all font-mono text-xs">{revealed[field.token] ?? field.preview}</span><label className="text-xs"><input type="checkbox" checked={field.secret} onChange={event => setDraft({ ...draft, fields: draft.fields.map(item => item.token === field.token ? { ...item, secret: event.target.checked } : item) })} />秘密</label><button className="cv-btn cv-btn-secondary text-xs" type="button" onPointerDown={() => void reveal(field.token)} onPointerUp={hide} onPointerLeave={hide} onBlur={hide} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); void reveal(field.token) } }} onKeyUp={hide}>按住显示</button></div></div>)}</fieldset>
    {!!initial.duplicates.length && <label className="block text-sm">发现已有资源<select className="cv-input mt-1" required value={choice} onChange={event => setChoice(event.target.value)}><option value="?">请选择更新或另存</option><option value="">另存为新资源</option>{initial.duplicates.map(item => <option key={item.id} value={item.id}>更新 {item.name}（保留旧版本）</option>)}</select></label>}
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clearSource} onChange={event => setClearSource(event.target.checked)} />保存后清除系统剪贴板中的这段原文</label>
    <div className="flex gap-2"><button className="cv-btn cv-btn-primary" disabled={busy || choice === '?'}>{busy ? '保存中…' : sendAfter ? '保存并继续发送' : '保存资源'}</button><button type="button" className="cv-btn cv-btn-secondary" onClick={onCancel}>返回</button></div>
  </form>
}
