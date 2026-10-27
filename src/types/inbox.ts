import type { ClipboardFilter } from './clipboard'
export type InboxKind = 'error_fix' | 'save_resource' | 'duplicate_secret' | 'organize' | 'rotate' | 'weak_password'
export interface InboxItem {
  id: string; type: InboxKind; sourceId: string | null; projectId: string | null; state: 'open' | 'done' | 'dismissed'; createdAt: number; updatedAt: number
  data: { title: string; reason: string; preview?: string; prompt?: string; ids: string[]; resourceIds?: string[]; action?: 'snippet' | 'delete' | 'resource' | 'protected'; analysis?: InboxAnalysis }
}
/** L2 后台只读预分析的状态与结论（结论已脱敏）。 */
export interface InboxAnalysis { state: 'queued' | 'running' | 'done' | 'failed'; text?: string; at: number }
export interface RecallResult { usedAI: boolean; filter: ClipboardFilter; labels: Array<{ key: keyof ClipboardFilter; text: string }> }
export interface OrganizeReview { id: string; entries: Array<{ id: string; preview: string; sensitive: boolean }> }
export interface ResourceHealth { resourceId: string; issues: Array<{ kind: 'rotate' | 'weak_password' | 'duplicate_secret'; text: string }> }
