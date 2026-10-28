import type { WorkApproval } from './workbench'

export type SessionState = 'idle' | 'starting' | 'running' | 'waiting_user' | 'stopping' | 'stopped' | 'failed' | 'queued'
export type SessionPermission = 'readonly' | 'confirm' | 'project_auto'
export interface Mention { kind: 'clipboard' | 'resource' | 'file'; id: string; label?: string }
export interface HostSessionSummary {
  id: string; projectId: string; title: string; state: SessionState; permission: SessionPermission
  directory: string; updatedAt: number; createdAt: number; pendingApprovals: number; pendingQuestions: number
  customTitle?: boolean
  planMode?: boolean
  /** 后台会话（L2 预分析）不出现在会话列表中。 */
  hidden?: 'preanalysis'
  /** 侧栏置顶 / 已归档（归档的会话不在侧栏，仍可在历史里找到）。 */
  pinned?: boolean
  archived?: boolean
  inboxId?: string
}
export interface QuestionItem { id: string; question: string; header?: string; detail?: string; options?: Array<{ label: string; description?: string }>; multiSelect?: boolean }
export interface QuestionAnswer { answers: Array<{ id: string; selected: string[]; custom?: string }> }
export interface UiQuestion { id: string; sessionId: string; questions: QuestionItem[]; state: 'open' | 'answered' | 'cancelled'; answer?: QuestionAnswer }
export type UiEvent =
  | { seq: number; type: 'user_message' | 'assistant_message'; text: string; at: number; streamId?: string }
  | { seq: number; type: 'process'; summary: string; items: Array<{ tool: string; state: string; callId?: string }>; at: number }
  | { seq: number; type: 'approval'; approval: WorkApproval & { state?: 'pending' | 'allowed' | 'rejected' | 'closed' }; at: number }
  | { seq: number; type: 'question'; question: UiQuestion; at: number }
  | { seq: number; type: 'proposal'; id: string; resourceId: string; name: string; patch: Record<string, unknown>; state: 'pending' | 'applied' | 'rejected'; at: number }
  | { seq: number; type: 'status'; state: SessionState; text: string; at: number }
  | { seq: number; type: 'error' | 'verification' | 'change'; text: string; at: number }
export interface PromptInput { text: string; mentions?: Mention[]; attachmentIds?: string[]; allowPossibleSecret?: boolean }
export interface SessionAPI {
  search(query: string): Promise<SessionSearchResult>
  setPlanMode(input: { sessionId: string; active: boolean }): Promise<void>
  rename(input: { sessionId: string; title: string }): Promise<void>
  context(id: string): Promise<SessionContext>
  deleteSchedule(input: { sessionId: string; id: string }): Promise<void>
  setFlags(input: { sessionId: string; pinned?: boolean; archived?: boolean }): Promise<void>
  remove(sessionId: string): Promise<void>
  list(): Promise<HostSessionSummary[]>
  create(input: { projectId: string; title?: string; permission: SessionPermission }): Promise<HostSessionSummary>
  prompt(input: PromptInput & { sessionId: string }): Promise<{ messageId: string }>
  events(input: { sessionId: string; afterSeq: number }): Promise<UiEvent[]>
  stop(id: string): Promise<void>
  prewarm(id: string): Promise<void>
  respondApproval(input: { id: string; fingerprint: string; allowed: boolean }): Promise<void>
  answerQuestion(input: { id: string; answer: QuestionAnswer }): Promise<void>
  mentionCandidates(input: { sessionId?: string; kind: Mention['kind']; query: string }): Promise<Mention[]>
  respondProposal(input: { sessionId: string; id: string; allowed: boolean }): Promise<void>
  onChanged(listener: (event: { sessionId: string; seq: number }) => void): () => void
}
export interface SessionSearchResult { items: Array<{ id: string; title: string; snippet: string; seq: number }>; searched: number; total: number }
export interface SessionContext {
  mentions: Mention[]; attachments: string[]; changes: Array<{ path: string; before: string; after: string }>; model: string; permission: SessionPermission
  planMode?: boolean
  goal?: { objective: string; phase: string; roundsStarted: number; maxGoalRounds: number }
  todos?: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }>
  children?: Array<{ id: string; title: string; state: string; result: string }>
  compactions?: number
  /** 官方 workspace-changes 记录的每轮 git 快照差异（已脱敏）。 */
  workspaceChanges?: WorkspaceTurn[]
  /** 本会话的定时提醒（标题与指令已脱敏）。 */
  schedules?: Array<{ id: string; title: string; prompt: string; kind: string; scheduledAt: string; status: 'active' | 'inactive'; lastDeliveredAt?: string }>
}
export interface WorkspaceTurnFile { path: string; display: string; added: number; deleted: number; binary?: boolean; oversized?: boolean; hunks?: Array<{ oldStart: number; newStart: number; lines: string[] }>; coarse?: boolean }
export interface WorkspaceTurn { turn: number; at: number; total: number; added: number; deleted: number; files: WorkspaceTurnFile[] }
