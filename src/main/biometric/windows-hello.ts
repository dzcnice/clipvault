/**
 * Windows Hello 适配层
 *
 * Electron 31 未原生暴露 WinRT Hello API；Anthropic Windows 阵线上
 * 对 DEK 的可信保管由 DPAPI（safeStorage）提供。因此此层实际是
 * "safeStorage 是否可用 + 当前用户会话有效"。
 * 调用点：biometric/index.ts
 */

import * as osCrypto from '../crypto'

export interface WindowsHelloAdapter {
  isAvailable(): boolean
  /** Windows 上 "确认身份" 步骤由 OS 锁屏/登录会话隐含提供。此处直接 true。 */
  verify(_reason: string): Promise<boolean>
}

export const windowsHello: WindowsHelloAdapter = {
  isAvailable(): boolean {
    return process.platform === 'win32' && osCrypto.isEncryptionAvailable()
  },
  verify: async (_reason: string): Promise<boolean> => {
    // DPAPI 已绑定当前 Windows 用户，解密动作本身即授权
    return true
  }
}
