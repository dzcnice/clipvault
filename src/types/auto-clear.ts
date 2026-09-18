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

/** 自动清空 / 屏幕保护 IPC 通道 */
export const SECURITY_CHANNELS = {
  AUTO_CLEAR_SCHEDULE: 'security:auto-clear-schedule',
  AUTO_CLEAR_CANCEL: 'security:auto-clear-cancel',
  AUTO_CLEAR_STATUS: 'security:auto-clear-status',
  AUTO_CLEAR_EVENT: 'security:auto-clear-event',
  SCREEN_PROTECT_ENABLE: 'security:screen-protect-enable',
  SCREEN_PROTECT_DISABLE: 'security:screen-protect-disable',
  SCREEN_PROTECT_STATUS: 'security:screen-protect-status'
} as const
