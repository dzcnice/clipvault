/**
 * Windows 会话校验适配层（文件名历史遗留，不是真 Hello UI）
 *
 * Electron 不暴露 WinRT Hello 对话框。DEK 由 DPAPI（safeStorage）保管。
 * isAvailable = 当前用户能用 safeStorage；verify 对解锁路径恒 true，
 * 敏感操作确认走 confirm.ts 的 DPAPI 解包，不弹系统生物识别窗。
 */

import * as osCrypto from '../crypto'

export interface WindowsHelloAdapter {
  isAvailable(): boolean
  /** 解锁路径不弹窗；敏感确认请用 confirmViaDpapiEnrollment。 */
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
