/**
 * Sprint 13 / TASK-070 凭证使用审计日志类型
 */

export type CredentialAuditAction =
  | 'view'
  | 'copy'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'reveal'

export interface CredentialAuditEntry {
  id: string
  credentialId: string
  credentialName: string | null
  /** 动作发起者（默认 'local-user'，团队场景可为 member id） */
  actor: string
  action: CredentialAuditAction
  timestamp: number
  /** 任意 JSON，UI 按 action 展示 */
  metadata: string | null
}

export interface CredentialAuditListParams {
  credentialId?: string
  action?: CredentialAuditAction
  fromTs?: number
  toTs?: number
  limit?: number
  offset?: number
}

export interface CredentialAuditListResult {
  items: CredentialAuditEntry[]
  total: number
}

export interface RecordAuditInput {
  credentialId: string
  credentialName?: string | null
  actor?: string
  action: CredentialAuditAction
  metadata?: Record<string, unknown> | null
  timestamp?: number
}

export const AUDIT_CHANNELS = {
  RECORD: 'sprint13:audit-record',
  LIST: 'sprint13:audit-list',
  EXPORT_CSV: 'sprint13:audit-export-csv',
  CLEAR: 'sprint13:audit-clear'
} as const
