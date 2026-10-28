/** 独立工作台契约。所有对外资源记录仅包含字段描述，不包含秘密值。 */
export type ResourceKind = 'account' | 'api' | 'database' | 'snippet' | 'command' | 'link' | 'note' | 'model'
export type ResourceState = 'saved' | 'verified' | 'revoked'
export type TaskState = 'draft' | 'queued' | 'running' | 'waiting' | 'verifying' | 'completed' | 'failed' | 'interrupted' | 'stopping' | 'stopped'
export interface WorkProject {
  id: string; name: string; description: string; directory: string; environment: string
  createdAt: number; updatedAt: number; archived: boolean; packageName?: string
  /** L2：复制到本项目的报错是否在后台做只读预分析；默认关闭。 */
  preanalysis?: boolean
  /** 允许本项目的会话联网查资料（主进程代为出网）；随手问默认开启。 */
  web?: boolean
  /** 内置项目：随手问使用应用私有空目录，不能编辑。 */
  builtin?: 'quick'
}
export interface ProjectInput { id?: string; name: string; description?: string; directory: string; environment?: string; packageName?: string; preanalysis?: boolean; web?: boolean }
export type FieldRole = 'username' | 'password' | 'api_key' | 'token' | 'totp_seed' | 'host' | 'port' | 'database' | 'connection_string' | 'other'
export interface ResourceMetadata { aliases?: string[]; tags?: string[]; loginUrl?: string; rotateAfterDays?: number; notes?: string }
export interface ResourceFieldInput { name: string; value: string; secret: boolean; role?: FieldRole }
export interface ResourceField { name: string; secret: boolean; version: number; configured: boolean; displayValue?: string; role?: FieldRole }
export interface WorkResource extends ResourceMetadata {
  id: string; name: string; kind: ResourceKind; projectId: string | null; environment: string
  purpose: string; endpoint: string; state: ResourceState; version: number
  fields: ResourceField[]; createdAt: number; updatedAt: number; legacyCredentialId: string | null
  lastUsedAt?: number | null
  verification?: { taskId: string; runId: string; createdAt: number; endpoint: string; status: number }
}
export interface ResourceInput extends ResourceMetadata {
  id?: string; expectedVersion?: number; name: string; kind: ResourceKind; projectId?: string | null
  environment: string; purpose?: string; endpoint?: string; fields: ResourceFieldInput[]
}
export interface ResourceDraft { fields: ResourceFieldInput[]; endpoint: string; warnings: string[]; suggested?: { name?: string; purpose?: string; environment?: string; projectName?: string; kind?: ResourceKind } }
export interface ContextItem {
  id: string; sourceId: string | null; kind: 'clipboard' | 'text' | 'file'; title: string
  text: string; sha256: string; redacted: boolean; createdAt: number
}
export interface TaskInput {
  projectId: string; title?: string; prompt: string; acceptance?: string; clipboardIds?: string[]; resourceIds?: string[]; attachmentIds?: string[]
}
export interface TaskFollowUpInput { taskId: string; prompt: string; clipboardIds?: string[]; resourceIds?: string[]; attachmentIds?: string[]; expectedRevision: number }
export interface TaskUpdate { id: string; prompt: string; context: ContextItem[]; resourceIds: string[]; createdAt: number; revision: number }
export interface WorkTask {
  id: string; projectId: string; title: string; prompt: string; acceptance: string; environment: string
  directory: string; resourceIds: string[]; state: TaskState; context: ContextItem[]
  createdAt: number; updatedAt: number; activeRunId: string | null
  revision?: number; updates?: TaskUpdate[]
}
export interface WorkRun {
  id: string; taskId: string; sessionId: string; runtimeVersion: string; state: TaskState
  startedAt: number; endedAt: number | null; summary: string; error: string; resumedFrom: string | null; inputRevision?: number
  workspace?: { git: boolean; head: string; branch: string; dirtyCount: number; checkedAt: number }
}
export interface WorkEvent {
  id: number; runId: string; kind: 'message' | 'tool' | 'approval' | 'result' | 'error' | 'status'
  text: string; createdAt: number
}
export interface WorkChange { id: string; runId: string; path: string; before: string; after: string; state: string; sha256: string }
export interface TaskDetail { task: WorkTask; runs: WorkRun[]; events: WorkEvent[]; changes: WorkChange[] }
export interface WorkApproval {
  id: string; taskId: string; runId: string; operation: string; target: string
  description: string; fingerprint: string; expiresAt: number
  difference?: { before: string; after: string }
}
export interface ModelConfig {
  resourceId: string | null; field: string; model: string; endpoint: string; maxRequests: number; maxMinutes: number
  protocol?: 'anthropic' | 'openai-chat'
}
/** 模型服务设置：密钥只进不出，渲染层只知道是否已保存。 */
export interface ModelServiceStatus {
  configured: boolean; keyConfigured: boolean; endpoint: string; protocol: NonNullable<ModelConfig['protocol']>
  model: string; maxRequests: number; maxMinutes: number
}
export interface ModelServiceInput {
  endpoint: string; protocol: NonNullable<ModelConfig['protocol']>; apiKey?: string; model: string; maxRequests: number; maxMinutes: number
}
export interface ModelOption { id: string; owner?: string; label?: string }
export interface HarnessStatus {
  available: boolean; version: string; sourceCommit: string; message: string
  terminalEnabled: boolean; activeTaskId: string | null; activeTaskIds?: string[]; approvals: WorkApproval[]
}
export interface WorkbenchSnapshot {
  projects: WorkProject[]; resources: WorkResource[]; tasks: WorkTask[]; harness: HarnessStatus; model: ModelConfig
}
export interface TaskTemplate { id: string; name: string; prompt: string; acceptance: string; builtIn?: boolean }
