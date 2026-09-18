/**
 * 生物识别 / 会话确认类型
 *
 * - Windows：safeStorage (DPAPI) 包装 DEK。Electron 不弹 Windows Hello UI，
 *   确认等于「当前用户会话能解开已注册的 DEK」
 * - macOS：systemPreferences.promptTouchID + safeStorage 保护 DEK
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
  AVAILABILITY: 'security:biometric-availability',
  ENROLL: 'security:biometric-enroll',
  UNLOCK: 'security:biometric-unlock',
  DISABLE: 'security:biometric-disable'
} as const
