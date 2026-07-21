/**
 * 凭证健康检查类型（Sprint 11 · TASK-059）
 */

export type HealthIssueType =
  | 'weak_password'
  | 'reused_password'
  | 'stale_unused'
  | 'pwned'

export interface HealthIssue {
  credentialId: string
  credentialName: string
  type: HealthIssueType
  /** 严重度 low / medium / high */
  severity: 'low' | 'medium' | 'high'
  /** 展示给用户的说明（中文） */
  message: string
  /** 额外数据（例如 zxcvbn score、分组内成员 id、距今天数） */
  meta?: Record<string, unknown>
}

export interface HealthReport {
  generatedAt: number
  totalCredentials: number
  scannedCredentials: number
  issues: HealthIssue[]
  /** 分类聚合计数 */
  summary: Record<HealthIssueType, number>
}

export type HealthReportStatus =
  | { state: 'ready'; report: HealthReport }
  | { state: 'session_required' }
  | { state: 'error'; error: string }

export interface HIBPCheckResult {
  pwned: boolean
  /** 被泄露次数 */
  count: number
  /** 来源缓存 or 网络 */
  source: 'cache' | 'network'
}
