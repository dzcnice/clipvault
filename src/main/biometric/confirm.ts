/**
 * 敏感操作生物识别确认（目标形态）
 *
 * - prefs 关闭 → 直接通过
 * - prefs 开启但未注册 → 拒绝并给出可操作错误
 * - prefs 开启且已注册 → OS 生物识别 gesture
 */

import { getPrefs } from '../prefs'
import { getAvailability } from './index'
import { windowsHello } from './windows-hello'
import { touchId } from './touch-id'

export type SensitiveAction = 'copy' | 'export' | 'reveal'

export interface ConfirmSensitiveResult {
  ok: boolean
  error?: string
  skipped?: boolean
}

async function gesture(reason: string): Promise<boolean> {
  if (process.platform === 'win32') return windowsHello.verify(reason)
  if (process.platform === 'darwin') return touchId.verify(reason)
  return false
}

/**
 * @param action copy | export | reveal
 * @param reason 展示给系统生物识别对话框的文案
 */
export async function confirmSensitiveAction(
  action: SensitiveAction,
  reason: string
): Promise<ConfirmSensitiveResult> {
  const prefs = getPrefs()
  const need =
    action === 'copy'
      ? prefs.biometricOnCopy
      : action === 'export'
        ? prefs.biometricOnExport
        : prefs.biometricOnCopy

  if (!need) {
    return { ok: true, skipped: true }
  }

  const avail = getAvailability()
  if (!avail.isAvailable) {
    return {
      ok: false,
      error: '当前系统不支持生物识别，请在设置中关闭「复制/导出需生物识别」'
    }
  }
  if (!avail.enrolled) {
    return {
      ok: false,
      error: '尚未注册生物识别。请先在设置中注册 Windows Hello / 触控 ID'
    }
  }

  const passed = await gesture(reason)
  if (!passed) {
    return { ok: false, error: '生物识别未通过或已取消' }
  }
  return { ok: true }
}
