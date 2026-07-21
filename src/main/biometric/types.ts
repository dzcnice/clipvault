/**
 * 主进程内部生物识别类型（对外类型见 src/types/biometric.ts）
 */

export interface BiometricEnrollmentRow {
  id: number
  mechanism: string
  encrypted_dek: Buffer
  created_at: number
  updated_at: number
  fail_count: number
  locked_until: number
}

/** 失败锁定：连续失败 3 次 → 锁定 60s */
export const BIOMETRIC_MAX_FAIL = 3
export const BIOMETRIC_LOCK_MS = 60_000
