/**
 * 健康检查内部类型（Sprint 11 · TASK-059）
 *
 * 对外公开类型见 src/types/health.ts；此处放实现细节类型。
 */

import type { HealthReport } from '../../types/health'

/** 检查结果包装 */
export type HealthScanResult =
  | { code: 'ok'; report: HealthReport; score: number }
  | { code: 'session_required' }
  | { code: 'error'; error: string }

/** 缓存项 */
export interface CachedScan {
  at: number
  result: HealthScanResult
}
