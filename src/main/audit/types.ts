/**
 * 主进程审计内部类型
 */

import type { RecordAuditInput } from '../../types/audit'

export interface AuditQueueOptions {
  /** 每次 flush 之间的最大延迟 ms（默认 500） */
  flushIntervalMs?: number
  /** 达到该条数立即 flush（默认 50） */
  flushThreshold?: number
}

export interface QueuedAudit extends RecordAuditInput {
  /** 入队时间，用于诊断 */
  enqueuedAt: number
}
