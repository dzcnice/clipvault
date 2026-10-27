import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import * as store from '../../db/workbench-store'
import { createSessionRecord, sessionRecords, updateSessionRecord, readEncryptedSession, sessionFamilyOperation, saveSessionReceipt, sessionReceipts } from '../../db/harness-session-store'
import type { HostSessionSummary, PromptInput, QuestionAnswer, SessionPermission, SessionState, UiEvent } from '../../types/session'
import type { WorkRun, WorkTask, ModelConfig, WorkApproval } from '../../types/workbench'
import { getWorkbench, registerNativeLifecycle } from '../workbench/service'
import { boundedText, fingerprint } from '../workbench/input'
import { allResourceSecrets, outboundRedact, findBlockingSecret, findPossibleSecret, containsSecrets } from '../workbench/redaction'
import { verifyRuntime, workerEnvironment, HARNESS_VERSION } from '../workbench/runtime'
import { createBridge, endpointURL } from '../workbench/bridge'
import { WorkApprovals } from '../workbench/approvals'
import { ProjectFiles, within } from '../workbench/files'
import { TaskTools } from '../workbench/tools'
import { SessionProjection } from './projection'
import { SessionQuestions } from './questions'
import { HostTransport } from './transport'
import { UtilityHost, type StructuredRequest } from './utility'
import { DataTools, mentionCandidates, resolveMentions, resourcePatchSchema } from './data-tools'
import { getDatabase } from '../../db/connection'
import { isUnlocked } from '../crypto/vault'
import { getInbox, updateInboxAnalysis } from '../../db/inbox-store'
import { getClipboardItemById } from '../../db/clipboard-store'
import { advancedContext } from './advanced-context'
import { findGit } from './git'
import { ScheduleRunner } from '../schedule/runner'
import { createSchedule, sessionSchedules, getSchedule, replaceSchedule, deleteSchedule, scheduleHistory } from '../schedule/store'
import { sanitizeWorkspaceTurn, workspaceTurns, removeWorkspaceScratch } from './workspace-changes'
import type { Mention } from '../../types/session'

type Job = { id: string; directory: string; input: PromptInput; attachments?: import('../../types/workbench').ContextItem[]; resolve: (value: { messageId: string }) => void; reject: (error: Error) => void; background?: { inboxId: string } }
/** L2 后台预分析的硬上限：只读、小额度、每个项目每天有限次数。 */
export const PREANALYSIS_LIMITS = { maxRequests: 6, maxMinutes: 3, perProjectPerDay: 10, maxInputChars: 8000 }
type Active = { id: string; directory: string; controller: AbortController; tools?: TaskTools; dataTools?: DataTools; transport?: HostTransport; poll?: (value: unknown) => void; failure?: string; cancel: boolean; closing: boolean; done: Promise<void>
  /** workspace/changes 事件序号 → 等待 Host 把摘要送回；关闭进程前必须收到或超时。 */
  workspace: Map<number, { settled: Promise<void>; settle: () => void }> }
type Warm = { directory: string; signature: string; controller: AbortController; ready: Promise<void>; transport?: HostTransport; bridge?: Awaited<ReturnType<typeof createBridge>>; timer?: ReturnType<typeof setTimeout> }
export class HostManager {
  private initialized = false
  private closing = false
  private active = new Map<string, Active>()
  private warm = new Map<string, Warm>()
  private queue: Job[] = []
  private projections = new Map<string, SessionProjection>()
  private listeners = new Set<(event: { sessionId: string; seq: number }) => void>()
  private approvalsSeen = new Map<string, WorkApproval>()
  private approvalDecisions = new Map<string, 'allowed' | 'rejected'>()
  private utility?: UtilityHost
  readonly approvals = new WorkApprovals(() => this.approvalsChanged())
  readonly questions = new SessionQuestions(question => {
    saveSessionReceipt(question.sessionId, question.id, 'question', question.state, question)
    this.projection(question.sessionId).add({ type: 'question', question, at: Date.now() })
    if (this.active.has(question.sessionId)) this.state(question.sessionId, question.state === 'open' ? 'waiting_user' : 'running')
    this.changed(question.sessionId)
  })
  readonly runtimeRoot = getWorkbench().runtimeRoot
  /** 定时提醒：官方工具 + 官方时间规则，计时与投递在主进程。 */
  readonly schedules = new ScheduleRunner(this.runtimeRoot, (id, text) => this.deliverReminder(id, text), id => this.all().some(item => item.id === id && !item.hidden))
  readonly dataRoot = join(app.getPath('userData'), 'harness-sessions')
  get busy(): boolean { return this.active.size > 0 || this.queue.length > 0 || this.warm.size > 0 || !!this.utility?.busy }
  structured<T>(request: StructuredRequest<T>): Promise<T> {
    this.utility ??= new UtilityHost(this.runtimeRoot, join(this.dataRoot, 'utility'), () => this.model())
    return this.utility.structured(request)
  }
  reportPromptFailure(id: string, error: unknown): void {
    if (!isUnlocked() || this.closing) return
    if (this.get(id).state === 'stopped') return
    this.projection(id).add({ type: 'error', text: outboundRedact(error instanceof Error ? error.message : '会话未能启动').text, at: Date.now() })
    this.state(id, 'failed'); this.changed(id)
  }
  onChange(listener: (event: { sessionId: string; seq: number }) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private changed(id: string): void { for (const listener of this.listeners) listener({ sessionId: id, seq: this.projection(id).seq }) }
  private initialize(): void {
    if (this.initialized) return
    for (const item of sessionRecords<HostSessionSummary>()) if (['running', 'starting', 'waiting_user', 'stopping', 'queued'].includes(item.state)) updateSessionRecord(item.id, { ...item, state: 'stopped' })
    this.initialized = true
    this.schedules.start()
  }
  private all(): HostSessionSummary[] {
    this.initialize()
    return sessionRecords<HostSessionSummary>().map(item => ({ ...item, title: outboundRedact(item.title).text, pendingApprovals: this.approvals.list().filter(a => a.taskId === item.id).length, pendingQuestions: this.questions.list(item.id).length }))
  }
  /** 用户可见的会话；L2 后台预分析会话不出现在列表里。 */
  list(): HostSessionSummary[] { return this.all().filter(item => !item.hidden) }
  private get(id: string): HostSessionSummary {
    boundedText(id, '会话 ID', 100, true)
    const item = this.all().find(item => item.id === id)
    if (!item) throw new Error('会话不存在')
    return item
  }
  private state(id: string, state: SessionState, text = ''): void {
    updateSessionRecord(id, { ...this.get(id), state })
    this.projection(id).add({ type: 'status', state, text, at: Date.now() }); this.changed(id)
  }
  private projection(id: string): SessionProjection {
    let projection = this.projections.get(id)
    if (!projection) {
      projection = new SessionProjection()
      for (const event of readEncryptedSession(id)?.events ?? []) projection.append(event)
      for (const receipt of sessionReceipts(id)) if (receipt.operation === 'approval') projection.add({ type: 'approval', approval: { ...(receipt.data as unknown as WorkApproval), state: receipt.state === 'allowed' || receipt.state === 'rejected' ? receipt.state : 'closed' }, at: Date.now() })
      for (const receipt of sessionReceipts(id)) if (receipt.operation === 'question') projection.add({ type: 'question', question: { ...(receipt.data as unknown as import('../../types/session').UiQuestion), state: receipt.state === 'answered' ? 'answered' : 'cancelled' }, at: Date.now() })
      for (const receipt of sessionReceipts(id)) if (receipt.operation === 'resource_proposal') projection.add({ type: 'proposal', id: receipt.id, resourceId: String(receipt.data.resourceId), name: outboundRedact(receipt.data.resourceId ? store.getResource(String(receipt.data.resourceId)).name : String((receipt.data.patch as { name: string }).name)).text, patch: resourcePatchSchema.parse(receipt.data.patch), state: receipt.state === 'applied' ? 'applied' : receipt.state === 'pending' && Number(receipt.data.expiresAt) > Date.now() ? 'pending' : 'rejected', at: Date.now() })
      this.projections.set(id, projection)
    }
    return projection
  }
  events(id: string, afterSeq: number): UiEvent[] {
    this.get(id)
    if (!Number.isSafeInteger(afterSeq) || afterSeq < -1) throw new Error('事件游标无效')
    return this.projection(id).events(afterSeq)
  }
  rename(id: string, title: string): void { updateSessionRecord(id, { ...this.get(id), title: outboundRedact(boundedText(title, '会话标题', 120, true)).text, customTitle: true }); this.changed(id) }
  async setPlanMode(id: string, value: boolean): Promise<void> {
    const session = this.get(id)
    if (typeof value !== 'boolean' || this.active.has(id) || this.queue.some(job => job.id === id)) throw new Error('请先停止当前轮次，再切换计划模式')
    await this.stop(id)
    updateSessionRecord(id, { ...session, planMode: value }); this.changed(id)
  }
  context(id: string): import('../../types/session').SessionContext {
    const session = this.get(id), receipts = sessionReceipts(id), mentions = new Map<string, Mention>()
    for (const receipt of receipts) if (receipt.operation === 'mentions') for (const mention of receipt.data.mentions as Mention[]) mentions.set(mention.kind + mention.id, { ...mention, label: outboundRedact(mention.label ?? mention.id).text })
    return { ...advancedContext(id), planMode: session.planMode ?? false, mentions: [...mentions.values()], attachments: receipts.filter(item => item.operation === 'attachment').map(item => outboundRedact(String((item.data.attachment as { name: string }).name)).text), changes: receipts.filter(item => item.operation === 'write_file' && item.state === 'completed').map(item => ({ path: outboundRedact(String(item.data.path)).text, before: outboundRedact(String(item.data.before)).text, after: outboundRedact(String(item.data.content)).text })), model: (config => config.resourceId ? config.model : '')(store.getModelConfig()), permission: session.permission, workspaceChanges: workspaceTurns(receipts), schedules: sessionSchedules(id).map(item => ({ id: item.id, title: outboundRedact(item.record.title).text, prompt: outboundRedact(item.record.prompt).text, kind: item.record.kind, scheduledAt: item.record.scheduledAt, status: item.status, lastDeliveredAt: item.lastDelivery?.deliveredAt })) }
  }
  async createSession(input: { projectId: string; title?: string; permission: SessionPermission }): Promise<HostSessionSummary> {
    this.initialize()
    if (this.closing) throw new Error('应用正在关闭')
    if (!['readonly', 'confirm', 'project_auto'].includes(input.permission)) throw new Error('会话权限无效')
    const project = store.getProject(boundedText(input.projectId, '项目 ID', 100, true))
    const directory = await getWorkbench().validateDirectory(project.directory)
    const id = randomUUID(), now = Date.now()
    createSessionRecord(id, project.id, { title: outboundRedact(boundedText(input.title ?? '新会话', '标题', 120, true)).text, permission: input.permission, state: 'idle', directory, createdAt: now })
    this.changed(id); return this.get(id)
  }
  async prompt(id: string, input: PromptInput): Promise<{ messageId: string }> {
    return (await this.enqueue(id, input)).pending
  }
  /**
   * 定时提醒到期：作为一条新消息排进原会话即视为投递完成。
   * 之后照常经过"发送消息并使用项目上下文"的每轮审批，不会绕过用户直接调用模型。
   */
  async deliverReminder(id: string, text: string): Promise<{ messageId: string }> {
    const session = this.get(id)
    if (session.hidden) throw new Error('后台会话不接收提醒')
    const { pending } = await this.enqueue(id, { text, allowPossibleSecret: true })
    pending.catch(() => {})
    return { messageId: `reminder-${randomUUID()}` }
  }
  private async enqueue(id: string, input: PromptInput): Promise<{ pending: Promise<{ messageId: string }> }> {
    const session = this.get(id)
    const text = boundedText(input.text, '消息', 100_000, true)
    if (findBlockingSecret(text)) throw new Error('检测到账号或密钥，消息尚未发送。请先在资源库保存，再使用资源引用。')
    if (!input.allowPossibleSecret && findPossibleSecret(text)) throw new Error('POSSIBLE_SECRET：这段像是密码，要先存为资源吗？')
    const projectPath = store.getProject(session.projectId).directory
    const directory = await getWorkbench().validateDirectory(session.directory)
    const projectDirectory = await getWorkbench().validateDirectory(projectPath)
    if (directory !== session.directory || directory !== projectDirectory || store.getProject(session.projectId).directory !== projectPath) throw new Error('项目目录已改变，请新建会话')
    const references = await resolveMentions(input.mentions, new ProjectFiles(directory, [app.getPath('userData')]))
    for (const mention of references.mentions) if (mention.kind === 'clipboard') getDatabase().prepare('INSERT OR IGNORE INTO wb_session_clipboard_refs(session_id,clipboard_id) VALUES(?,?)').run(id, mention.id)
    const attachments = await getWorkbench().preparedAttachments(input.attachmentIds ?? [])
    const attachmentText = attachments.map(item => `\n附件 ${item.title}（已脱敏文字快照）：\n${item.text}`).join('\n')
    if (this.closing || this.active.has(id) || this.queue.some(item => item.id === id)) throw new Error('会话正在运行或排队，请先停止')
    const pending = new Promise<{ messageId: string }>((resolve, reject) => { this.queue.push({ id, directory, attachments, input: { text: text + references.context + attachmentText, mentions: references.mentions }, resolve, reject }) })
    this.state(id, 'queued'); this.drain()
    return { pending }
  }
  private available(directory: string, id?: string): boolean {
    const occupied = [...this.active.values(), ...[...this.warm.entries()].filter(([key]) => key !== id && !this.active.has(key)).map(([, value]) => value)]
    return occupied.length < 2 && !occupied.some(item => within(item.directory, directory) || within(directory, item.directory))
  }
  private drain(): void {
    while (!this.closing && this.active.size < 2) {
      // 用户自己的会话优先；后台预分析只在没有用户任务排队时启动，且同一时间最多一个。
      const userWaiting = this.queue.some(job => !job.background)
      const backgroundActive = [...this.active.keys()].some(id => !!this.get(id).hidden)
      const index = this.queue.findIndex(job => this.available(job.directory, job.id) && (!job.background || (!userWaiting && !backgroundActive)))
      if (index < 0) break
      const job = this.queue.splice(index, 1)[0]!
      const warmed = this.warm.get(job.id)
      const active: Active = { id: job.id, directory: job.directory, controller: warmed?.controller ?? new AbortController(), cancel: false, closing: false, done: Promise.resolve(), workspace: new Map() }
      clearTimeout(warmed?.timer)
      this.active.set(job.id, active)
      active.done = this.execute(job, active).finally(() => { this.active.delete(job.id); this.changed(job.id); this.drain() })
    }
  }
  private model(): ModelConfig {
    const model = store.getModelConfig()
    if (!model.resourceId) throw new Error('请先在设置中配置模型服务')
    const resource = store.getResource(model.resourceId)
    if (resource.kind !== 'model' || resource.state === 'revoked' || endpointURL(model.endpoint).href !== endpointURL(resource.endpoint).href) throw new Error('模型资源与服务地址不匹配')
    return model
  }
  private approvalsChanged(): void {
    const pending = this.approvals.list()
    for (const item of pending) if (!this.approvalsSeen.has(item.id)) {
      this.approvalsSeen.set(item.id, item)
      saveSessionReceipt(item.taskId, item.id, 'approval', 'pending', item)
      this.projection(item.taskId).add({ type: 'approval', approval: { ...item, state: 'pending' }, at: Date.now() })
      this.state(item.taskId, 'waiting_user')
    }
    for (const [id, item] of this.approvalsSeen) if (!pending.some(value => value.id === id)) {
      const state = this.approvalDecisions.get(id) ?? 'closed'
      saveSessionReceipt(item.taskId, id, 'approval', state, item)
      this.projection(item.taskId).add({ type: 'approval', approval: { ...item, state }, at: Date.now() })
      this.approvalsSeen.delete(id); this.approvalDecisions.delete(id)
    }
    for (const id of this.active.keys()) this.changed(id)
  }
  private notification(id: string, value: unknown): void {
    const notification = value as { method?: string; params?: { sessionId?: string; event?: { type?: string; data?: Record<string, unknown> } } }
    if (notification.method !== 'session.event' || notification.params?.sessionId !== id || !notification.params.event) return
    const event = notification.params.event, data = event.data ?? {}
    if (event.type === 'turn/end') {
      const kind = (data.reason as { kind?: string } | undefined)?.kind
      const active = this.active.get(id)
      if (active && kind && !['completed', 'aborted'].includes(kind)) active.failure = kind === 'max-tokens' ? '本轮达到输出限制，请继续或缩小任务范围' : '本轮执行未完成，请检查模型设置与执行记录'
    }
    if (event.type === 'session/title' && typeof data.title === 'string' && !this.get(id).customTitle) updateSessionRecord(id, { ...this.get(id), title: outboundRedact(data.title).text.slice(0, 120) })
    if (event.type === 'plan/mode' && typeof data.active === 'boolean') updateSessionRecord(id, { ...this.get(id), planMode: data.active })
    if (event.type === 'workspace/changes') { const active = this.active.get(id), seq = (event as { seq?: number }).seq; if (active && Number.isSafeInteger(seq)) this.workspaceSlot(active, seq!) }
    this.projection(id).append(event); this.changed(id)
  }
  private async control(active: Active, operation: string, input: Record<string, unknown>): Promise<unknown> {
    if (input.sessionId !== active.id) throw new Error('会话控制越界')
    const signal = active.controller.signal
    if (operation === 'policy') return { planMode: this.get(active.id).planMode ?? false }
    if (operation === 'attachment') {
      const ref = input.ref as { attachmentId: string; name: string; bytes: number }, offset = input.offset as number
      if (!ref || !/^[a-f0-9]{64}$/.test(ref.attachmentId) || !Number.isSafeInteger(offset) || offset < 0) throw new Error('附件请求无效')
      const receipt = sessionReceipts(active.id).find(item => item.operation === 'attachment' && item.id === ref.attachmentId)
      if (!receipt || JSON.stringify(receipt.data.attachment) !== JSON.stringify(ref)) throw new Error('附件不属于本会话')
      const text = String(receipt.data.text), bytes = Buffer.from(text)
      if (bytes.length !== ref.bytes || fingerprint(text) !== ref.attachmentId || offset > bytes.length || containsSecrets(text, allResourceSecrets())) throw new Error('附件已变化或包含受保护字段')
      if (offset + 65536 >= bytes.length) saveSessionReceipt(active.id, ref.attachmentId, 'attachment', 'saved', { ...receipt.data, verifiedAt: Date.now() })
      return { data: bytes.subarray(offset, offset + 65536).toString('base64'), done: offset + 65536 >= bytes.length }
    }
    if (operation === 'schedule') return this.scheduleControl(active.id, input)
    if (operation === 'workspace_changes' || operation === 'workspace_skip') {
      const seq = Number(input.seq)
      if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('工作区变更序号无效')
      if (operation === 'workspace_changes') saveSessionReceipt(active.id, `workspace:${seq}`, 'workspace_changes', 'recorded', sanitizeWorkspaceTurn(input))
      this.workspaceSlot(active, seq).settle(); this.changed(active.id)
      return { received: true }
    }
    if (operation === 'stream') { this.projection(active.id).stream(input.frame); this.changed(active.id); return { received: true } }
    if (operation === 'next') {
      if (active.cancel) { await new Promise(resolve => setTimeout(resolve, 50)); return { type: 'cancel' } }
      return new Promise(resolve => {
        const done = (value: unknown): void => { clearTimeout(timer); signal.removeEventListener('abort', abort); if (active.poll === done) active.poll = undefined; resolve(value) }
        const abort = (): void => done({ type: 'cancel' })
        const timer = setTimeout(() => done({ type: 'idle' }), 30_000)
        active.poll?.({ type: 'idle' }); active.poll = done
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
      })
    }
    // 后台预分析没有人在场：追问直接取消，官方工具授权一律拒绝。
    if (this.get(active.id).hidden && (operation === 'question' || operation === 'approval')) {
      if (operation === 'approval') return { decision: 'deny' }
      throw new Error('后台预分析不能向用户提问')
    }
    if (operation === 'question') return this.questions.request(active.id, input.questions, signal)
    if (operation === 'approval') {
      try {
        await this.approvals.request({ taskId: active.id, runId: active.id, operation: 'Harness 工具授权', target: outboundRedact(boundedText(input.tool, '工具', 200, true)).text,
          description: outboundRedact(boundedText(input.reason ?? '', '原因', 4000)).text }, input, signal)
        this.state(active.id, 'running'); return { decision: 'allow' }
      } catch { return { decision: 'deny' } }
    }
    throw new Error('未知会话控制操作')
  }
  private workspaceSlot(active: Active, seq: number): { settled: Promise<void>; settle: () => void } {
    let slot = active.workspace.get(seq)
    if (!slot) { let settle!: () => void; const settled = new Promise<void>(resolve => { settle = resolve }); slot = { settled, settle }; active.workspace.set(seq, slot) }
    return slot
  }
  /** 只给用户会话提供 git；后台预分析不做工作区快照。 */
  private gitEnvironment(session: HostSessionSummary): Record<string, string> {
    if (session.hidden) return {}
    const git = findGit()
    return { CV_SCHEDULE: '1', ...(git ? { CV_GIT_PATH: git } : {}) }
  }
  private scheduleControl(sessionId: string, input: Record<string, unknown>): unknown {
    const id = typeof input.id === 'string' ? input.id : ''
    let result: unknown
    switch (input.action) {
      case 'create': result = { record: createSchedule(sessionId, input.record) }; break
      case 'list': result = { records: sessionSchedules(sessionId, 'active').map(item => item.record) }; break
      case 'catalog': result = { entries: sessionSchedules(sessionId).map(item => ({ ...item.record, sessionId, status: item.status, ...(item.lastDelivery ? { lastDelivery: item.lastDelivery } : {}) })) }; break
      case 'get': { const item = getSchedule(sessionId, id); result = item ? { current: item.record, status: item.status } : {}; break }
      case 'replace': result = replaceSchedule(sessionId, id, input.previous, input.record); break
      case 'delete': result = deleteSchedule(sessionId, id); break
      case 'history': result = scheduleHistory(sessionId, id, input.limit, input.before); break
      default: throw new Error('未知提醒操作')
    }
    if (['create', 'replace', 'delete'].includes(String(input.action))) { this.schedules.arm(); this.changed(sessionId) }
    return result
  }
  /** 用户在会话上下文面板里删除提醒。 */
  removeSchedule(sessionId: string, id: string): void {
    this.get(sessionId)
    deleteSchedule(sessionId, boundedText(id, '提醒 ID', 100, true)); this.schedules.arm(); this.changed(sessionId)
  }
  private scopedTool(active: Active, operation: string, args: Record<string, unknown>, scope?: { agentId?: unknown; planMode?: unknown }): Promise<unknown> {
    if (!active.dataTools || typeof scope?.agentId !== 'string') throw new Error('工具缺少会话身份')
    const child = scope.agentId !== active.id
    if (child && !sessionReceipts(active.id).some(item => item.operation === 'child_session' && item.id === scope.agentId)) throw new Error('工具会话越界')
    const readonly = child || scope.planMode === true || this.get(active.id).planMode === true || !!this.get(active.id).hidden
    if (readonly && !['workbench_list_files', 'workbench_read_file', 'workbench_verify_file', 'clipboard_search', 'clipboard_read', 'resource_list'].includes(operation)) throw new Error('计划模式和子 Agent 仅可只读分析')
    return active.dataTools.execute(operation, args)
  }
  private async execute(job: Job, active: Active): Promise<void> {
    let bridge: Awaited<ReturnType<typeof createBridge>> | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const { signal } = active.controller
    try {
      const session = this.get(job.id), project = store.getProject(session.projectId), configured = this.model()
      // 后台预分析使用更小的请求与时间额度，不能超过用户的模型设置。
      const model = job.background ? { ...configured, maxRequests: Math.min(configured.maxRequests, PREANALYSIS_LIMITS.maxRequests), maxMinutes: Math.min(configured.maxMinutes, PREANALYSIS_LIMITS.maxMinutes) } : configured
      const modelVersion = store.getResource(model.resourceId!).version
      this.state(job.id, 'starting')
      if (await getWorkbench().validateDirectory(session.directory) !== active.directory) throw new Error('项目实际目录已改变')
      const manifest = await verifyRuntime(this.runtimeRoot)
      signal.throwIfAborted()
      const files = new ProjectFiles(active.directory, [app.getPath('userData')])
      for (const receipt of sessionReceipts(job.id).filter(item => item.state === 'started')) {
        if (receipt.operation !== 'write_file') throw new Error('上次操作结果不确定，请先核对会话记录')
        const current = await files.read(String(receipt.data.path)).catch(() => null)
        if (current?.sha256 !== fingerprint(String(receipt.data.content))) throw new Error('上次文件修改结果不确定，请先核对项目文件')
        saveSessionReceipt(job.id, receipt.id, receipt.operation, 'completed', receipt.data)
      }
      if (job.background) {
        // 同意来自用户在项目设置中显式开启的预分析；记录在案，不弹每轮审批。
        if (!store.getProject(session.projectId).preanalysis) throw new Error('项目已关闭预分析')
        saveSessionReceipt(job.id, randomUUID(), 'preanalysis_consent', 'project_setting', { projectId: project.id, inboxId: job.background.inboxId, limits: { maxRequests: model.maxRequests, maxMinutes: model.maxMinutes } })
        updateInboxAnalysis(job.background.inboxId, { state: 'running', at: Date.now() })
      } else await this.approvals.request({ taskId: job.id, runId: job.id, operation: '发送消息并使用项目上下文', target: model.endpoint,
        description: `模型：${model.model}\n项目：${project.name}\n目录：${active.directory}\n本轮最多 ${model.maxRequests} 次请求、${model.maxMinutes} 分钟。\n${job.input.text}` }, { model, modelVersion, input: job.input }, signal)
      this.state(job.id, 'running')
      const home = join(this.dataRoot, job.id), checks = join(this.dataRoot, 'checks')
      await mkdir(home, { recursive: true }); await mkdir(checks, { recursive: true })
      const task: WorkTask = { id: job.id, projectId: project.id, title: session.title, prompt: job.input.text, acceptance: '', directory: active.directory, environment: project.environment, resourceIds: [], state: 'running', context: [], createdAt: session.createdAt, updatedAt: Date.now(), activeRunId: job.id }
      const run: WorkRun = { id: job.id, taskId: job.id, sessionId: job.id, runtimeVersion: HARNESS_VERSION, state: 'running', startedAt: Date.now(), endedAt: null, summary: '', error: '', resumedFrom: null }
      const tools = new TaskTools(task, run, files, this.approvals, signal, checks, allResourceSecrets, () => this.changed(job.id), this.runtimeRoot, {
        permission: session.permission,
        event: (_runId, kind, text) => { this.projection(job.id).add({ type: kind === 'error' ? 'error' : kind === 'result' ? 'verification' : 'change', text: outboundRedact(text).text, at: Date.now() }) },
        receipt: (id, _run, operation, _hash, state, data) => saveSessionReceipt(job.id, id, operation, state, data)
      })
      active.tools = tools
      const dataTools = new DataTools({ ...session, directory: active.directory }, tools, this.approvals, signal, event => { this.projection(job.id).add(event); this.changed(job.id) })
      active.dataTools = dataTools
      const warmed = this.warm.get(job.id)
      if (warmed && warmed.signature !== JSON.stringify({ model, modelVersion })) throw new Error('预热后模型设置已改变，请重新发送消息')
      if (warmed) await warmed.ready
      bridge = warmed?.bridge ?? await createBridge({ model, signal, streaming: true, secrets: allResourceSecrets, session: input => sessionFamilyOperation(job.id, input),
        control: (operation, input) => this.control(active, operation, input), modelKey: () => store.readResourceField(model.resourceId!, model.field, modelVersion),
        tool: (operation, args, scope) => this.scopedTool(active, operation, args, scope) })
      signal.throwIfAborted()
      const transport = warmed?.transport ?? new HostTransport(this.runtimeRoot, manifest.node, active.directory, { ...workerEnvironment(home, bridge.url, bridge.token), CV_SESSION_ID: job.id, CV_HARNESS_NATIVE: '1', ...this.gitEnvironment(session) }, value => this.notification(job.id, value), () => { if (!active.closing) active.controller.abort(new Error('运行时意外退出')) })
      active.transport = transport
      timer = setTimeout(() => active.controller.abort(new Error('会话达到时间限制')), model.maxMinutes * 60_000)
      const closeOnAbort = (): void => { active.closing = true; void transport.close() }
      signal.addEventListener('abort', closeOnAbort, { once: true })
      if (signal.aborted) closeOnAbort()
      if (!warmed) await transport.request({ type: 'initialize', directory: active.directory, home, model: model.model })
      if (readEncryptedSession(job.id)) await transport.request({ method: 'session/resume', params: { sessionId: job.id } })
      for (const mention of job.input.mentions ?? []) if (mention.kind === 'clipboard') getDatabase().prepare('INSERT OR IGNORE INTO wb_session_clipboard_refs(session_id,clipboard_id) VALUES(?,?)').run(job.id, mention.id)
      if (job.input.mentions?.length) saveSessionReceipt(job.id, randomUUID(), 'mentions', 'recorded', { mentions: job.input.mentions })
      const attachmentRefs = (job.attachments ?? []).map(item => {
        const text = outboundRedact(item.text).text, attachment = { attachmentId: fingerprint(text), name: outboundRedact(item.title).text.replace(/[\\/]/g, '_'), bytes: Buffer.byteLength(text) }
        saveSessionReceipt(job.id, attachment.attachmentId, 'attachment', 'saved', { attachment, text })
        return { type: 'file', attachment }
      })
      const result = await transport.request({ method: 'session/prompt', params: { sessionId: job.id, contentBlocks: [{ type: 'text', text: job.input.text }, ...attachmentRefs] } }) as { messageId: string }
      job.resolve({ messageId: result.messageId })
      await transport.request({ method: 'session/wait', params: { sessionId: job.id } }, model.maxMinutes * 60_000)
      // 本轮若记录了工作区变更，等 Host 把摘要送回再关闭进程（快照只在进程存活时可读）。
      await Promise.race([Promise.all([...active.workspace.values()].map(slot => slot.settled)), new Promise(resolve => setTimeout(resolve, 15_000))])
      signal.throwIfAborted()
      if (active.failure) throw new Error(active.failure)
      this.state(job.id, active.cancel ? 'stopped' : 'idle')
      if (job.background) {
        const answer = this.projection(job.id).events(-1).flatMap(event => event.type === 'assistant_message' ? [event.text] : []).at(-1)
        updateInboxAnalysis(job.background.inboxId, answer ? { state: 'done', text: answer, at: Date.now() } : { state: 'failed', text: '没有得到分析结论', at: Date.now() })
      }
    } catch (error) {
      const message = active.cancel ? '会话已停止；已批准的修改保留' : outboundRedact(error instanceof Error ? error.message : '会话未完成').text
      this.state(job.id, active.cancel ? 'stopped' : 'failed', message)
      if (job.background && isUnlocked()) { try { updateInboxAnalysis(job.background.inboxId, { state: 'failed', text: message, at: Date.now() }) } catch { /* 建议可能已被清除 */ } }
      job.reject(new Error(message))
    } finally {
      clearTimeout(timer); active.closing = true
      this.approvals.cancelRun(job.id); active.controller.abort()
      await active.tools?.settled()
      await active.transport?.close()
      await removeWorkspaceScratch(join(this.dataRoot, job.id))
      await bridge?.close()
      const warmed = this.warm.get(job.id)
      if (warmed) { this.warm.delete(job.id); clearTimeout(warmed.timer); await warmed.transport?.close(); await warmed.ready.catch(() => {}); await warmed.bridge?.close() }
      this.projection(job.id).clearStreams()
    }
  }
  async prewarm(id: string): Promise<void> {
    const session = this.get(id)
    if (this.closing || this.active.has(id) || this.warm.has(id) || this.queue.some(job => job.id === id)) return
    const directory = await getWorkbench().validateDirectory(session.directory)
    const manifest = await verifyRuntime(this.runtimeRoot), model = this.model(), modelVersion = store.getResource(model.resourceId!).version
    if (this.closing || this.active.has(id) || this.warm.has(id) || !this.available(directory)) return
    const home = join(this.dataRoot, id), warmed: Warm = { directory, signature: JSON.stringify({ model, modelVersion }), controller: new AbortController(), ready: Promise.resolve() }
    this.warm.set(id, warmed)
    warmed.ready = (async () => {
      await mkdir(home, { recursive: true })
      warmed.bridge = await createBridge({ model, streaming: true, signal: warmed.controller.signal, secrets: allResourceSecrets,
        session: input => sessionFamilyOperation(id, input), modelKey: () => store.readResourceField(model.resourceId!, model.field, modelVersion),
        control: (operation, input) => {
          const active = this.active.get(id)
          if (active) return this.control(active, operation, input)
          if (operation !== 'next' || input.sessionId !== id) throw new Error('会话尚未开始')
          return new Promise(resolve => { const timer = setTimeout(() => resolve({ type: 'idle' }), 1000); timer.unref() })
        },
        tool: (operation, args, scope) => { const active = this.active.get(id); if (!active) throw new Error('会话尚未授权'); return this.scopedTool(active, operation, args, scope) }
      })
      warmed.controller.signal.throwIfAborted()
      warmed.transport = new HostTransport(this.runtimeRoot, manifest.node, directory, { ...workerEnvironment(home, warmed.bridge.url, warmed.bridge.token), CV_SESSION_ID: id, CV_HARNESS_NATIVE: '1', ...this.gitEnvironment(session) }, value => this.notification(id, value), () => { if (!this.active.get(id)?.closing) warmed.controller.abort() })
      warmed.controller.signal.addEventListener('abort', () => { void warmed.transport?.close() }, { once: true })
      await warmed.transport.request({ type: 'initialize', directory, home, model: model.model })
    })()
    const discard = async (): Promise<void> => {
      if (this.active.has(id)) return
      this.warm.delete(id); warmed.controller.abort()
      await warmed.transport?.close(); await warmed.bridge?.close(); this.drain()
    }
    try { await warmed.ready; warmed.timer = setTimeout(() => { void discard() }, 30_000); warmed.timer.unref() }
    catch (error) { await discard(); throw error }
  }
  /**
   * L2：为收件箱里的报错建议排队一次后台只读预分析。
   * 只在项目显式开启、模型已配置、且未超过每日次数时执行；用户任务始终优先。
   * 返回 false 表示没有排队（未开启、超限、内容含密钥等），不会抛出给复制流程。
   */
  async preanalyze(inboxId: string): Promise<boolean> {
    this.initialize()
    if (this.closing || !isUnlocked()) return false
    const item = getInbox(inboxId)
    if (!item || item.type !== 'error_fix' || !item.projectId || item.data.analysis) return false
    const project = store.getProject(item.projectId)
    if (!project.preanalysis || !store.getModelConfig().resourceId) return false
    const since = Date.now() - 86_400_000
    if (this.all().filter(session => session.hidden === 'preanalysis' && session.projectId === project.id && session.createdAt > since).length >= PREANALYSIS_LIMITS.perProjectPerDay) return false
    const clip = item.sourceId ? getClipboardItemById(item.sourceId) : null
    const raw = (clip && !clip.decryptError ? clip.content : '') || item.data.preview || ''
    // 原文含已知秘密或高确定性密钥时整条跳过，而不是脱敏后照发。
    if (findBlockingSecret(raw)) return false
    const excerpt = outboundRedact(raw.slice(0, PREANALYSIS_LIMITS.maxInputChars)).text
    if (!excerpt.trim()) return false
    const directory = await getWorkbench().validateDirectory(project.directory)
    const id = randomUUID()
    createSessionRecord(id, project.id, { title: '报错预分析', permission: 'readonly', state: 'idle', directory, createdAt: Date.now(), planMode: true, hidden: 'preanalysis', inboxId })
    updateInboxAnalysis(inboxId, { state: 'queued', at: Date.now() })
    const text = ['这是用户刚复制的一段报错（已脱敏），来自本项目。请只读分析：',
      '1. 用只读工具查看相关代码，找出最可能的原因和涉及的文件；',
      '2. 给出修复思路，但不要修改文件、不要运行命令、不要向用户提问、不要退出计划模式；',
      '3. 用中文回答，不超过 300 字，区分"已确认"和"推测"。', '', '报错内容：', excerpt].join('\n')
    void new Promise<{ messageId: string }>((resolve, reject) => { this.queue.push({ id, directory, input: { text }, resolve, reject, background: { inboxId } }) }).catch(() => {})
    this.state(id, 'queued'); this.drain()
    return true
  }
  async stop(id: string): Promise<void> {
    this.get(id)
    for (const receipt of sessionReceipts(id)) if (receipt.operation === 'resource_proposal' && receipt.state === 'pending') this.respondProposal(id, receipt.id, false)
    const queued = this.queue.findIndex(item => item.id === id)
    if (queued >= 0) { const [job] = this.queue.splice(queued, 1); job!.reject(new Error('已取消排队')); this.state(id, 'stopped'); return }
    const active = this.active.get(id)
    if (!active) {
      const warmed = this.warm.get(id)
      if (warmed) { this.warm.delete(id); clearTimeout(warmed.timer); warmed.controller.abort(); await warmed.ready.catch(() => {}); await warmed.transport?.close(); await warmed.bridge?.close() }
      return
    }
    this.state(id, 'stopping'); active.cancel = true
    active.poll?.({ type: 'cancel' })
    // Graceful plugin cancellation first; abort closes the process if it cannot settle.
    const fallback = setTimeout(() => active.controller.abort(), 1500)
    try { await active.done } finally { clearTimeout(fallback) }
  }
  respondApproval(id: string, hash: string, allowed: boolean): void {
    this.approvalDecisions.set(id, allowed ? 'allowed' : 'rejected')
    try { this.approvals.respond(id, hash, allowed) } finally { this.approvalDecisions.delete(id) }
  }
  answerQuestion(id: string, answer: QuestionAnswer): void { this.questions.answer(id, answer) }
  async mentionCandidates(input: { sessionId?: string; kind: Mention['kind']; query: string }): Promise<Mention[]> {
    const directory = input.sessionId ? await getWorkbench().validateDirectory(this.get(input.sessionId).directory) : undefined
    return mentionCandidates(input.kind, input.query, directory ? new ProjectFiles(directory, [app.getPath('userData')]) : undefined)
  }
  respondProposal(sessionId: string, id: string, allowed: boolean): void {
    this.get(sessionId)
    const receipt = sessionReceipts(sessionId).find(item => item.id === id && item.operation === 'resource_proposal' && item.state === 'pending')
    if (!receipt) throw new Error('资源建议已失效')
    const old = receipt.data.resourceId ? store.getResource(String(receipt.data.resourceId)) : undefined, patch = resourcePatchSchema.parse(receipt.data.patch)
    let resourceId = old?.id ?? '', name = old?.name ?? patch.name ?? '新资料'
    if (allowed) {
      if (Number(receipt.data.expiresAt) <= Date.now()) throw new Error('资源建议已过期，请重新生成')
      if (old && (old.state === 'revoked' || old.version !== receipt.data.version)) throw new Error('资源版本已变化，请重新生成建议')
      const project = store.getProject(this.get(sessionId).projectId)
      const saved = store.saveResource({ ...(old ?? { name, kind: 'note', environment: project.environment, projectId: project.id, endpoint: '' }), ...patch, expectedVersion: old?.version, fields: [] })
      resourceId = saved.id; name = saved.name
    }
    const state = allowed ? 'applied' : 'rejected'
    saveSessionReceipt(sessionId, id, 'resource_proposal', state, { ...receipt.data, resourceId })
    this.projection(sessionId).add({ type: 'proposal', id, resourceId, name: outboundRedact(name).text, patch, state, at: Date.now() }); this.changed(sessionId)
  }
  async suspend(): Promise<void> {
    this.schedules.stop()
    await this.shutdown()
    this.utility = undefined
    this.projections.clear(); this.approvalsSeen.clear(); this.initialized = false; this.closing = false
  }
  async shutdown(): Promise<void> {
    this.closing = true
    this.schedules.stop()
    await this.utility?.shutdown()
    for (const job of this.queue.splice(0)) { job.reject(new Error('应用正在关闭')); this.state(job.id, 'stopped') }
    await Promise.all([...this.active.keys()].map(id => this.stop(id)))
    await Promise.all([...this.warm.keys()].map(id => this.stop(id)))
  }
}
let instance: HostManager | undefined
export function getHostManager(): HostManager {
  if (!instance) { instance = new HostManager(); registerNativeLifecycle({ busy: () => instance?.busy ?? false, suspend: async () => { await instance?.suspend() }, shutdown: async () => { await instance?.shutdown() } }) }
  return instance
}
