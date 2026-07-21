/**
 * Sprint 13 / TASK-067 生物识别解锁类型
 *
 * - Windows：safeStorage (DPAPI) 包装 DEK，不走 Windows Hello API（Electron 31
 *   不直接暴露 Hello），同等可信级别由 DPAPI 提供
 * - macOS：systemPreferences.promptTouchID 进行身份确认 + safeStorage 保护 DEK
 * - Linux：不支持（isAvailable=false）
 */

export type BiometricPlatform = 'win32' | 'darwin' | 'linux' | 'other'

export interface BiometricAvailability {
  /** 当前平台是否支持生物识别解锁 */
  isAvailable: boolean
  /** 底层机制名：dpapi / touch-id / unsupported */
  mechanism: 'dpapi' | 'touch-id' | 'unsupported'
  platform: BiometricPlatform
  /** 是否已启用（用户已注册 DEK 信封） */
  enrolled: boolean
}

export interface BiometricEnrollResult {
  success: boolean
  error?: string
}

export interface BiometricUnlockResult {
  success: boolean
  /** 失败 3 次进入锁定时返回剩余秒 */
  lockedForMs?: number
  error?: string
}

export const BIOMETRIC_CHANNELS = {
  AVAILABILITY: 'sprint13:biometric-availability',
  ENROLL: 'sprint13:biometric-enroll',
  UNLOCK: 'sprint13:biometric-unlock',
  DISABLE: 'sprint13:biometric-disable'
} as const
