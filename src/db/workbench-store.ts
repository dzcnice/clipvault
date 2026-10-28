import { randomUUID } from 'node:crypto'
import { getDatabase, transaction } from './connection'
import * as vault from '../main/crypto/vault'
import { boundedText, secretName, resourceEndpoint } from '../main/workbench/input'
import { fieldRoles, inferRole, sensitiveRole } from '../main/resources/roles'
import { indexSecret } from '../main/resources/secret-index'
import { getTOTP } from './credential-totp-store'
import type { FieldRole, ResourceMetadata } from '../types/workbench'
import type { ContextItem, ModelConfig, ProjectInput, ResourceInput, TaskDetail, TaskInput, TaskFollowUpInput, TaskState, WorkEvent, WorkProject, WorkResource, WorkRun, WorkTask } from '../types/workbench'

function encrypt(value: unknown): string { return vault.encryptWithDEK(JSON.stringify(value)) }
function decrypt<T>(value: string): T { return JSON.parse(vault.decryptWithDEK(value)) as T }
function unlocked(): void { if (!vault.isUnlocked()) throw new Error('请先解锁本地资料库') }
type ProjectRow = { id: string; name: string; data: string; archived: number; created_at: number; updated_at: number }
type ResourceRow = { id: string; name: string; kind: WorkResource['kind']; project_id: string | null; environment: string; data: string; state: WorkResource['state']; version: number; legacy_credential_id: string | null; created_at: number; updated_at: number; last_used_at: number | null }
type FieldRow = { name: string; version: number; secret: number; value_encrypted: string; role: FieldRole }
type TaskRow = { id: string; project_id: string; data: string; state: TaskState; active_run_id: string | null; created_at: number; updated_at: number }
type RunRow = { id: string; task_id: string; session_id: string; runtime_version: string; state: TaskState; data: string; started_at: number; ended_at: number | null }

function projectFrom(row: ProjectRow): WorkProject {
  return { id: row.id, name: row.name, ...decrypt<Pick<WorkProject, 'description' | 'directory' | 'environment'>>(row.data), archived: !!row.archived, createdAt: row.created_at, updatedAt: row.updated_at }
}
/** 内置「随手问」项目的固定 ID；不出现在项目列表、分类与资源归属中。 */
export const QUICK_PROJECT_ID = 'quick-ask'
export function listProjects(): WorkProject[] {
  unlocked()
  return (getDatabase().prepare('SELECT * FROM wb_projects WHERE id <> ? ORDER BY archived, updated_at DESC').all(QUICK_PROJECT_ID) as ProjectRow[]).map(projectFrom)
}
/** 创建或校正随手问项目：应用私有空目录、允许联网、不可编辑。 */
export function ensureQuickProject(directory: string): WorkProject {
  unlocked()
  const row = getDatabase().prepare('SELECT * FROM wb_projects WHERE id = ?').get(QUICK_PROJECT_ID) as ProjectRow | undefined
  if (row) { const current = projectFrom(row); if (current.directory === directory && current.builtin === 'quick') return current }
  const now = Date.now()
  getDatabase().prepare(`INSERT INTO wb_projects (id,name,data,created_at,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`).run(QUICK_PROJECT_ID, '随手问', encrypt({ directory, environment: 'personal', description: '不关联代码目录的日常问答，可联网，可引用剪贴板和资源。', packageName: '', preanalysis: false, web: true, builtin: 'quick' }), row?.created_at ?? now, now)
  return getProject(QUICK_PROJECT_ID)
}
export function getProject(id: string): WorkProject {
  unlocked()
  const row = getDatabase().prepare('SELECT * FROM wb_projects WHERE id = ?').get(id) as ProjectRow | undefined
  if (!row) throw new Error('项目不存在')
  return projectFrom(row)
}
export function saveProject(input: ProjectInput): WorkProject {
  unlocked()
  const name = boundedText(input.name, '项目名称', 120, true)
  const directory = boundedText(input.directory, '项目目录', 2048, true)
  const environment = boundedText(input.environment ?? 'development', '环境', 40, true)
  const description = boundedText(input.description ?? '', '项目说明', 4000)
  const id = input.id ?? randomUUID(), now = Date.now()
  if (id === QUICK_PROJECT_ID) throw new Error('随手问是内置项目，不能编辑')
  if (input.id) getProject(input.id)
  getDatabase().prepare(`INSERT INTO wb_projects (id,name,data,created_at,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,data=excluded.data,updated_at=excluded.updated_at`).run(id, name, encrypt({ directory, environment, description, packageName: boundedText(input.packageName ?? '', '包名', 200), preanalysis: input.preanalysis === true, web: input.web === true }), now, now)
  return getProject(id)
}

function latestFields(id: string): FieldRow[] {
  return getDatabase().prepare(`SELECT f.name,f.version,f.secret,f.value_encrypted,f.role FROM wb_resource_fields f
    WHERE f.resource_id=? AND f.version=(SELECT MAX(v.version) FROM wb_resource_fields v WHERE v.resource_id=f.resource_id AND v.name=f.name) ORDER BY f.name`).all(id) as FieldRow[]
}
function resourceFrom(row: ResourceRow): WorkResource {
  return { id: row.id, name: row.name, kind: row.kind, projectId: row.project_id, environment: row.environment,
    aliases: [], tags: [], ...decrypt<{ purpose: string; endpoint: string } & ResourceMetadata>(row.data), state: row.state, version: row.version, lastUsedAt: row.last_used_at,
    fields: latestFields(row.id).map(field => ({ name: field.name, role: field.role === 'other' ? inferRole(field.name) : field.role, version: field.version, secret: !!field.secret, configured: true,
      ...(field.secret ? {} : { displayValue: vault.decryptWithDEK(field.value_encrypted) }) })),
    legacyCredentialId: row.legacy_credential_id, createdAt: row.created_at, updatedAt: row.updated_at }
}
export function getResource(id: string): WorkResource {
  unlocked()
  const row = getDatabase().prepare('SELECT * FROM wb_resources WHERE id=?').get(id) as ResourceRow | undefined
  if (!row) throw new Error('资源不存在')
  return resourceFrom(row)
}
export function listResources(): WorkResource[] {
  unlocked()
  return (getDatabase().prepare('SELECT * FROM wb_resources ORDER BY updated_at DESC').all() as ResourceRow[]).map(resourceFrom)
}
export function resourceHistory(id: string): Array<{ name: string; version: number; role: FieldRole; createdAt: number }> {
  getResource(id)
  return getDatabase().prepare('SELECT name,version,role,created_at AS createdAt FROM wb_resource_fields WHERE resource_id=? ORDER BY version DESC,name').all(id) as Array<{ name: string; version: number; role: FieldRole; createdAt: number }>
}
export function saveResource(input: ResourceInput): WorkResource {
  unlocked()
  const kinds = ['account', 'api', 'database', 'snippet', 'command', 'link', 'note', 'model']
  if (!kinds.includes(input.kind)) throw new Error('资源类型无效')
  if (input.projectId) getProject(input.projectId)
  if (!Array.isArray(input.fields) || input.fields.length > 30) throw new Error('资源最多包含 30 个字段')
  const names = new Set<string>()
  const fields = input.fields.map(field => {
    const name = boundedText(field.name, '字段名', 64, true)
    if (names.has(name)) throw new Error('同一资源的字段名不能重复')
    names.add(name)
    boundedText(field.value, '字段值', 100_000, true)
    const value = field.value
    const role = field.role ?? inferRole(name, value)
    if (!fieldRoles.includes(role)) throw new Error('字段角色无效')
    return { name, value, role, secret: field.secret !== false || secretName(name) || sensitiveRole(role) }
  })
  const name = boundedText(input.name, '资源名称', 120, true)
  const environment = boundedText(input.environment, '环境', 40, true)
  const previous = input.id ? getResource(input.id) : undefined
  const labels = (values: unknown, title: string): string[] => {
    if (!Array.isArray(values) || values.length > 30) throw new Error(`${title}格式无效`)
    return [...new Set(values.map(value => boundedText(value, title, 100, true)))]
  }
  const endpoint = resourceEndpoint(boundedText(input.endpoint ?? '', '地址', 2048))
  const loginUrl = boundedText(input.loginUrl ?? previous?.loginUrl ?? '', '登录地址', 2048)
  if (loginUrl && (new URL(resourceEndpoint(loginUrl)).protocol !== 'https:' || !endpoint || new URL(loginUrl).origin !== new URL(endpoint).origin)) throw new Error('登录地址必须为与资源同源的 HTTPS 地址')
  const rotateAfterDays = input.rotateAfterDays ?? previous?.rotateAfterDays
  if (rotateAfterDays !== undefined && (!Number.isInteger(rotateAfterDays) || rotateAfterDays < 1 || rotateAfterDays > 3650)) throw new Error('轮换天数须在 1–3650 之间')
  const data = encrypt({ purpose: boundedText(input.purpose ?? '', '用途', 4000), endpoint, loginUrl, aliases: labels(input.aliases ?? previous?.aliases ?? [], '别名'), tags: labels(input.tags ?? previous?.tags ?? [], '标签'), rotateAfterDays, notes: boundedText(input.notes ?? previous?.notes ?? '', '备注', 8000) })
  return transaction(() => {
    const old = input.id ? getResource(input.id) : null
    if (old && old.version !== input.expectedVersion) throw new Error('资源已变化，请刷新后重新保存')
    const id = old?.id ?? randomUUID(), version = (old?.version ?? 0) + 1, now = Date.now()
    getDatabase().prepare(`INSERT INTO wb_resources (id,name,kind,project_id,environment,data,state,version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'saved',?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,
      project_id=excluded.project_id,environment=excluded.environment,data=excluded.data,state='saved',version=excluded.version,updated_at=excluded.updated_at`)
      .run(id, name, input.kind, input.projectId ?? null, environment, data, version, now, now)
    const insert = getDatabase().prepare('INSERT INTO wb_resource_fields (resource_id,name,version,secret,value_encrypted,created_at,role) VALUES (?,?,?,?,?,?,?)')
    for (const field of fields) {
      insert.run(id, field.name, version, Number(field.secret), vault.encryptWithDEK(field.value), now, field.role)
      if (field.secret) indexSecret(id, field.name, field.value)
    }
    return getResource(id)
  })
}
/** 仅主进程服务使用，绝不作为普通列表/详情的返回值。 */
export function readResourceField(id: string, name: string, expectedVersion?: number): string {
  const resource = getResource(id)
  if (resource.state === 'revoked') throw new Error('该资源已撤销')
  if (expectedVersion !== undefined && expectedVersion !== resource.version) throw new Error('资源版本已变化，原授权失效')
  const field = latestFields(id).find(item => item.name === name)
  if (!field) throw new Error('资源字段不存在')
  return vault.decryptWithDEK(field.value_encrypted)
}
export function revokeResource(id: string): void {
  getResource(id)
  getDatabase().prepare("UPDATE wb_resources SET state='revoked',version=version+1,updated_at=? WHERE id=?").run(Date.now(), id)
}
export function markResourceVerified(id: string, version: number, verification: NonNullable<WorkResource['verification']>): void {
  const resource = getResource(id)
  if (resource.version !== version || resource.state === 'revoked') throw new Error('资源已变化，本次验证不再有效')
  const data = getDatabase().prepare('SELECT data FROM wb_resources WHERE id=?').get(id) as { data: string }
  getDatabase().prepare("UPDATE wb_resources SET state='verified',data=? WHERE id=? AND version=?").run(encrypt({ ...decrypt<Record<string, unknown>>(data.data), verification }), id, version)
}
export function markResourceUsed(id: string): void { getResource(id); getDatabase().prepare('UPDATE wb_resources SET last_used_at=? WHERE id=?').run(Date.now(), id) }
export function importLegacyCredential(id: string): WorkResource {
  unlocked()
  const existing = getDatabase().prepare('SELECT id FROM wb_resources WHERE legacy_credential_id=?').get(id) as { id: string } | undefined
  if (existing) return getResource(existing.id)
  const old = getDatabase().prepare('SELECT * FROM credentials WHERE id=?').get(id) as { name: string; type: string; value: string; value_encrypted: number; metadata: string | null; description: string | null } | undefined
  if (!old) throw new Error('原凭证不存在')
  const metadata = old.metadata ? JSON.parse(old.metadata) as { username?: string; endpoint?: string } : {}
  const totp = getTOTP(id)
  return transaction(() => {
    const resource = saveResource({ name: old.name, kind: old.type === 'password' ? 'account' : 'api', environment: 'unspecified', purpose: old.description ?? '', endpoint: metadata.endpoint ?? '', fields: [
      { name: old.type === 'password' ? 'password' : 'key', value: old.value_encrypted ? vault.decryptWithDEK(old.value) : old.value, secret: true },
      ...(metadata.username ? [{ name: 'username', value: metadata.username, secret: false }] : []),
      ...(totp ? [{ name: 'totp', role: 'totp_seed' as const, value: `otpauth://totp/${encodeURIComponent(totp.account ?? old.name)}?secret=${encodeURIComponent(totp.secret)}&algorithm=${totp.algorithm}&digits=${totp.digits}&period=${totp.period}`, secret: true }] : [])
    ] })
    getDatabase().prepare('UPDATE wb_resources SET legacy_credential_id=? WHERE id=?').run(id, resource.id)
    return getResource(resource.id)
  })
}

/** Jarvis 的「关于我」：用户自己写或确认过的偏好，加密保存，注入系统提示。 */
export const ABOUT_ME_LIMIT = 4000
export function getAboutMe(): string {
  unlocked()
  const row = getDatabase().prepare("SELECT data FROM wb_settings WHERE key='jarvis.about'").get() as { data: string } | undefined
  return row ? decrypt<string>(row.data) : ''
}
export function saveAboutMe(text: string): string {
  unlocked()
  const value = boundedText(text, '关于我', ABOUT_ME_LIMIT).trim()
  getDatabase().prepare("INSERT INTO wb_settings (key,data) VALUES ('jarvis.about',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(encrypt(value))
  return value
}
/** 追加一条已确认的记忆；重复内容不再追加，超过上限时拒绝。 */
export function appendAboutMe(note: string): string {
  const current = getAboutMe(), line = `- ${note.trim()}`
  if (current.split('\n').some(item => item.trim() === line)) return current
  const next = current ? `${current}\n${line}` : line
  if (next.length > ABOUT_ME_LIMIT) throw new Error('「关于我」已满，请先在 Jarvis 设置里整理')
  return saveAboutMe(next)
}

/** 还没并入资源的原有凭证数量。 */
export function pendingLegacyCredentials(): number {
  unlocked()
  return (getDatabase().prepare("SELECT COUNT(*) AS n FROM credentials WHERE id NOT IN (SELECT legacy_credential_id FROM wb_resources WHERE legacy_credential_id IS NOT NULL)").get() as { n: number }).n
}
/** 把全部原有凭证（含 TOTP）并入资源；原记录保留只读，已并入的跳过，单条失败不影响其余。 */
export function importAllLegacyCredentials(): { imported: number; failed: number } {
  unlocked()
  const ids = (getDatabase().prepare("SELECT id FROM credentials WHERE id NOT IN (SELECT legacy_credential_id FROM wb_resources WHERE legacy_credential_id IS NOT NULL) ORDER BY created_at").all() as Array<{ id: string }>).map(row => row.id)
  let imported = 0, failed = 0
  for (const id of ids) { try { importLegacyCredential(id); imported++ } catch { failed++ } }
  return { imported, failed }
}

function taskFrom(row: TaskRow): WorkTask {
  return { ...decrypt<Omit<WorkTask, 'state' | 'activeRunId' | 'updatedAt'>>(row.data), state: row.state, activeRunId: row.active_run_id, updatedAt: row.updated_at }
}
export function listTasks(): WorkTask[] {
  unlocked()
  return (getDatabase().prepare('SELECT * FROM wb_tasks ORDER BY updated_at DESC LIMIT 300').all() as TaskRow[]).map(taskFrom)
}
export function getTask(id: string): WorkTask {
  unlocked()
  const row = getDatabase().prepare('SELECT * FROM wb_tasks WHERE id=?').get(id) as TaskRow | undefined
  if (!row) throw new Error('任务不存在')
  return taskFrom(row)
}
export function createTask(input: TaskInput, context: ContextItem[]): WorkTask {
  const project = getProject(input.projectId), now = Date.now()
  const task: WorkTask = { id: randomUUID(), projectId: project.id, title: boundedText(input.title || input.prompt.slice(0, 60), '任务名称', 120, true),
    prompt: boundedText(input.prompt, '任务目标', 50_000, true), acceptance: boundedText(input.acceptance ?? '', '验收标准', 4000),
    environment: project.environment, directory: project.directory, resourceIds: input.resourceIds ?? [], context, state: 'draft', activeRunId: null, createdAt: now, updatedAt: now, revision: 1, updates: [] }
  if (!Array.isArray(task.resourceIds) || task.resourceIds.length > 20) throw new Error('任务资源数量无效')
  for (const id of task.resourceIds) {
    const resource = getResource(id)
    if (resource.state === 'revoked' || (resource.projectId && resource.projectId !== project.id) || resource.environment !== project.environment) throw new Error('所选资源的项目、环境或状态不符合本任务')
  }
  getDatabase().prepare('INSERT INTO wb_tasks (id,project_id,data,state,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(task.id, task.projectId, encrypt(task), task.state, now, now)
  return task
}
export function appendTask(input: TaskFollowUpInput, context: ContextItem[]): WorkTask {
  return transaction(() => {
    const task = getTask(input.taskId)
    if (['queued', 'running', 'stopping', 'verifying'].includes(task.state)) throw new Error('请先停止当前运行，再补充要求')
    if ((task.revision ?? 1) !== input.expectedRevision) throw new Error('任务已有新补充，请刷新后再保存')
    if ((task.updates?.length ?? 0) >= 100) throw new Error('本任务已有 100 次补充，请新建任务')
    const resourceIds = input.resourceIds ?? task.resourceIds
    if (!Array.isArray(resourceIds) || resourceIds.length > 20 || new Set(resourceIds).size !== resourceIds.length) throw new Error('任务资源数量或内容无效')
    for (const id of resourceIds) {
      const resource = getResource(id)
      if (resource.state === 'revoked' || (resource.projectId && resource.projectId !== task.projectId) || resource.environment !== task.environment) throw new Error('所选资源的项目、环境或状态不符合本任务')
    }
    const prompt = boundedText(input.prompt, '补充要求', 20000, true)
    const updates = task.updates ?? [], revision = (task.revision ?? 1) + 1, now = Date.now()
    if (JSON.stringify([task.context, updates, context, prompt]).length > 250_000) throw new Error('任务上下文已过长，请新建任务')
    updates.push({ id: randomUUID(), prompt, context, resourceIds, createdAt: now, revision })
    const next: WorkTask = { ...task, updates, revision, resourceIds, state: 'draft', activeRunId: null, updatedAt: now }
    getDatabase().prepare("UPDATE wb_tasks SET data=?,state='draft',active_run_id=NULL,updated_at=? WHERE id=?").run(encrypt(next), now, task.id)
    return next
  })
}
export function setTaskState(id: string, state: TaskState, runId?: string): void {
  getDatabase().prepare('UPDATE wb_tasks SET state=?,active_run_id=COALESCE(?,active_run_id),updated_at=? WHERE id=?').run(state, runId ?? null, Date.now(), id)
}
function runFrom(row: RunRow): WorkRun {
  return { id: row.id, taskId: row.task_id, sessionId: row.session_id, runtimeVersion: row.runtime_version, state: row.state, startedAt: row.started_at, endedAt: row.ended_at, ...decrypt<Pick<WorkRun, 'summary' | 'error' | 'resumedFrom'>>(row.data) }
}
export function createRun(taskId: string, runtimeVersion: string, resume?: WorkRun): WorkRun {
  const task = getTask(taskId)
  const run: WorkRun = { id: randomUUID(), taskId, sessionId: resume?.sessionId ?? randomUUID(), runtimeVersion, state: 'running', startedAt: Date.now(), endedAt: null, summary: '', error: '', resumedFrom: resume?.id ?? null, inputRevision: task.revision ?? 1 }
  getDatabase().prepare('INSERT INTO wb_runs (id,task_id,session_id,runtime_version,state,data,started_at) VALUES (?,?,?,?,?,?,?)').run(run.id, taskId, run.sessionId, runtimeVersion, run.state, encrypt({ summary: '', error: '', resumedFrom: run.resumedFrom, inputRevision: run.inputRevision }), run.startedAt)
  setTaskState(taskId, 'running', run.id)
  return run
}
export function finishRun(id: string, state: TaskState, summary: string, error = ''): void {
  const row = getDatabase().prepare('SELECT * FROM wb_runs WHERE id=?').get(id) as RunRow | undefined
  if (!row) throw new Error('运行记录不存在')
  const run = runFrom(row)
  getDatabase().prepare('UPDATE wb_runs SET state=?,data=?,ended_at=? WHERE id=?').run(state, encrypt({ summary, error, resumedFrom: run.resumedFrom, inputRevision: run.inputRevision, workspace: run.workspace }), Date.now(), id)
  setTaskState(run.taskId, state)
}
export function addEvent(runId: string, kind: WorkEvent['kind'], text: string): void {
  getDatabase().prepare('INSERT INTO wb_events (run_id,kind,data,created_at) VALUES (?,?,?,?)').run(runId, kind, encrypt(text.slice(0, 100_000)), Date.now())
}
export function getTaskDetail(id: string): TaskDetail {
  const task = getTask(id)
  const runs = (getDatabase().prepare('SELECT * FROM wb_runs WHERE task_id=? ORDER BY started_at').all(id) as RunRow[]).map(runFrom)
  const rows = getDatabase().prepare('SELECT e.* FROM wb_events e JOIN wb_runs r ON r.id=e.run_id WHERE r.task_id=? ORDER BY e.id DESC LIMIT 1000').all(id) as Array<{ id: number; run_id: string; kind: WorkEvent['kind']; data: string; created_at: number }>
  const changes = (getDatabase().prepare("SELECT p.id,p.run_id,p.state,p.data FROM wb_receipts p JOIN wb_runs r ON r.id=p.run_id WHERE r.task_id=? AND p.operation='write_file' ORDER BY p.rowid").all(id) as Array<{ id: string; run_id: string; state: string; data: string }>).map(row => {
    const change = decrypt<{ path: string; before: string; content: string; sha256?: string }>(row.data)
    return { id: row.id, runId: row.run_id, state: row.state, path: change.path, before: change.before, after: change.content, sha256: change.sha256 ?? '' }
  })
  return { task, runs, changes, events: rows.reverse().map(row => ({ id: row.id, runId: row.run_id, kind: row.kind, text: decrypt<string>(row.data), createdAt: row.created_at })) }
}
export function recoverInterruptedRuns(): void {
  const rows = getDatabase().prepare("SELECT id FROM wb_runs WHERE ended_at IS NULL").all() as Array<{ id: string }>
  for (const row of rows) finishRun(row.id, 'interrupted', '', '应用在上次运行期间退出，请核对动作后继续')
  getDatabase().prepare("UPDATE wb_tasks SET state='interrupted' WHERE state='queued'").run()
}
/** 用于任务出口过滤，包括旧版本；从不通过 IPC 返回。 */
export function resourceSecrets(ids: string[]): string[] {
  unlocked()
  return ids.flatMap(id => (getDatabase().prepare('SELECT value_encrypted FROM wb_resource_fields WHERE resource_id=? AND secret=1').all(id) as Array<{ value_encrypted: string }>).map(row => vault.decryptWithDEK(row.value_encrypted)))
}
export function taskReceipts(taskId: string): Array<{ id: string; fingerprint: string; runId: string; operation: string; state: string; data: unknown }> {
  getTask(taskId)
  return (getDatabase().prepare('SELECT p.id,p.fingerprint,p.run_id AS runId,p.operation,p.state,p.data FROM wb_receipts p JOIN wb_runs r ON r.id=p.run_id WHERE r.task_id=? ORDER BY p.rowid').all(taskId) as Array<{ id: string; fingerprint: string; runId: string; operation: string; state: string; data: string }>).map(row => ({ ...row, data: decrypt(row.data) }))
}
export function saveRunWorkspace(id: string, workspace: NonNullable<WorkRun['workspace']>): void {
  const row = getDatabase().prepare('SELECT data FROM wb_runs WHERE id=?').get(id) as { data: string } | undefined
  if (!row) throw new Error('运行记录不存在')
  getDatabase().prepare('UPDATE wb_runs SET data=? WHERE id=?').run(encrypt({ ...decrypt<Record<string, unknown>>(row.data), workspace }), id)
}
export const DEFAULT_MODEL: ModelConfig = { resourceId: null, field: 'key', model: 'deepseek-v4-flash', endpoint: 'https://api.deepseek.com/anthropic', maxRequests: 30, maxMinutes: 20 }
export function getModelConfig(): ModelConfig {
  unlocked()
  const row = getDatabase().prepare("SELECT data FROM wb_settings WHERE key='model'").get() as { data: string } | undefined
  return row ? decrypt<ModelConfig>(row.data) : { ...DEFAULT_MODEL }
}
export function saveModelConfig(config: ModelConfig): ModelConfig {
  unlocked()
  if (config.protocol && !['anthropic', 'openai-chat'].includes(config.protocol)) throw new Error('模型协议无效')
  if (config.resourceId) {
    const resource = getResource(config.resourceId)
    if (resource.kind !== 'model' || resource.state === 'revoked' || !resource.fields.some(field => field.name === config.field)) throw new Error('请选择有效的模型服务及认证字段')
  }
  const normalized: ModelConfig = { resourceId: config.resourceId, field: boundedText(config.field, '认证字段', 64, true),
    protocol: config.protocol ?? 'anthropic',
    model: boundedText(config.model, '模型名称', 120, true), endpoint: boundedText(config.endpoint, '模型地址', 2048, true),
    maxRequests: Math.min(200, Math.max(1, Number.isFinite(config.maxRequests) ? Math.floor(config.maxRequests) : 30)),
    maxMinutes: Math.min(120, Math.max(1, Number.isFinite(config.maxMinutes) ? Math.floor(config.maxMinutes) : 20)) }
  getDatabase().prepare("INSERT INTO wb_settings (key,data) VALUES ('model',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(encrypt(normalized))
  return normalized
}
export function recordReceipt(id: string, runId: string, operation: string, fingerprint: string, state: string, data: unknown): void {
  getDatabase().prepare(`INSERT INTO wb_receipts (id,run_id,operation,fingerprint,state,data,created_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data`).run(id, runId, operation, fingerprint, state, encrypt(data), Date.now())
}
export function saveSessionArchive(sessionId: string, files: Record<string, string>): void {
  unlocked()
  getDatabase().prepare('INSERT INTO wb_settings (key,data) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(`session:${sessionId}`, encrypt(files))
}
export function readSessionArchive(sessionId: string): Record<string, string> | null {
  unlocked()
  const row = getDatabase().prepare('SELECT data FROM wb_settings WHERE key=?').get(`session:${sessionId}`) as { data: string } | undefined
  return row ? decrypt<Record<string, string>>(row.data) : null
}
