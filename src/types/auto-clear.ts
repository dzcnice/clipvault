/**
 * Sprint 13 / TASK-068 剪贴板自动清空相关类型
 *
 * 用于敏感凭证复制后 N 秒内自动清空剪贴板，避免长期残留。
 */

export type AutoClearEventType =
  | 'scheduled'
  | 'cancelled'
  | 'cleared'
  | 'skipped'

export interface AutoClearScheduledEvent {
  type: 'scheduled'
  /** sha256(secret) hex，UI 不依赖此值，仅用于诊断 */
  hash: string
  /** 计划清空的 ttl 毫秒数 */
  ttlMs: number
  /** 计划清空的绝对时间戳（毫秒） */
  scheduledAt: number
}

export interface AutoClearCancelledEvent {
  type: 'cancelled'
}

export interface AutoClearClearedEvent {
  type: 'cleared'
}

export interface AutoClearSkippedEvent {
  type: 'skipped'
  reason: 'content-changed'
}

export type AutoClearEvent =
  | AutoClearScheduledEvent
  | AutoClearCancelledEvent
  | AutoClearClearedEvent
  | AutoClearSkippedEvent

export interface AutoClearStatus {
  active: boolean
  remainingMs: number
  ttlMs: number
}

/** Sprint 13 IPC 通道（独立命名空间，便于整合人接线） */
export const SPRINT13_CHANNELS = {
  AUTO_CLEAR_SCHEDULE: 'sprint13:auto-clear-schedule',
  AUTO_CLEAR_CANCEL: 'sprint13:auto-clear-cancel',
  AUTO_CLEAR_STATUS: 'sprint13:auto-clear-status',
  AUTO_CLEAR_EVENT: 'sprint13:auto-clear-event',
  SCREEN_PROTECT_ENABLE: 'sprint13:screen-protect-enable',
  SCREEN_PROTECT_DISABLE: 'sprint13:screen-protect-disable',
  SCREEN_PROTECT_STATUS: 'sprint13:screen-protect-status'
} as const
