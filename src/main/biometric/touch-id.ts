/**
 * macOS Touch ID 适配层
 *
 * 使用 systemPreferences.promptTouchID；不支持时返回 false。
 */

import { systemPreferences } from 'electron'
import * as osCrypto from '../crypto'

export interface TouchIdAdapter {
  isAvailable(): boolean
  verify(reason: string): Promise<boolean>
}

function canPromptTouchID(): boolean {
  if (process.platform !== 'darwin') return false
  try {
    // canPromptTouchID 在未支持 Touch ID 的 Mac 上返回 false
    return (
      typeof systemPreferences.canPromptTouchID === 'function' &&
      systemPreferences.canPromptTouchID() === true
    )
  } catch {
    return false
  }
}

export const touchId: TouchIdAdapter = {
  isAvailable(): boolean {
    return canPromptTouchID() && osCrypto.isEncryptionAvailable()
  },
  verify: async (reason: string): Promise<boolean> => {
    if (!canPromptTouchID()) return false
    try {
      await systemPreferences.promptTouchID(reason)
      return true
    } catch {
      return false
    }
  }
}
