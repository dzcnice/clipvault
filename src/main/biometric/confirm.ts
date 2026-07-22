/**
 * 敏感操作生物识别确认（目标形态）
 *
 * - prefs 关闭 → 直接通过
 * - prefs 开启但未注册 → 拒绝
 * - prefs 开启且已注册：
 *   - darwin：Touch ID 真提示
 *   - win32：Electron 无原生 Hello UI；以「能用当前用户 DPAPI 解出注册的 DEK 包装」
 *     作为会话身份证明（与 unlock 同源），解完立即清零，不注入 vault
 *   - 其它平台：不支持
 *
 * 同时尊重 fail_count / locked_until（与 unlock 一致，防暴力）。
 */

import { getDatabase } from '../../db/connection'
import * as osCrypto from '../crypto'
import { getPrefs } from '../prefs'
import { getAvailability } from './index'
import {
  BIOMETRIC_LOCK_MS,
  BIOMETRIC_MAX_FAIL,
  type BiometricEnrollmentRow
} from './types'
import { windowsHello } from './windows-hello'
import { touchId } from './touch-id'

export type SensitiveAction = 'copy' | 'export' | 'reveal'

export interface ConfirmSensitiveResult {
  ok: boolean
  error?: string
  skipped?: boolean
}

function readRow(): BiometricEnrollmentRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM biometric_enrollment WHERE id = 1').get() as
    | BiometricEnrollmentRow
    | undefined
  return row ?? null
}

function bumpFail(): void {
  const db = getDatabase()
  const row = readRow()
  if (!row) return
  const nextFail = row.fail_count + 1
  const lockedUntil =
    nextFail >= BIOMETRIC_MAX_FAIL ? Date.now() + BIOMETRIC_LOCK_MS : row.locked_until
  db.prepare(
    `UPDATE biometric_enrollment SET fail_count = ?, locked_until = ?, updated_at = ? WHERE id = 1`
  ).run(nextFail, lockedUntil, Date.now())
}

function resetFail(): void {
  const db = getDatabase()
  db.prepare(
    `UPDATE biometric_enrollment SET fail_count = 0, locked_until = 0, updated_at = ? WHERE id = 1`
  ).run(Date.now())
}

/**
 * Windows：用 DPAPI 解开注册的 DEK 包装作为「当前用户会话有效」证明。
 * 不解入 vault，用完清零。
 */
function confirmViaDpapiEnrollment(): boolean {
  const row = readRow()
  if (!row?.encrypted_dek) return false
  try {
    const cipher = Buffer.isBuffer(row.encrypted_dek)
      ? row.encrypted_dek
      : Buffer.from(row.encrypted_dek as ArrayBuffer)
    const plain = osCrypto.decryptBuffer(cipher)
    // 期望 32 字节 DEK（或 base64 解码后等长）
    const ok = plain.length >= 16
    plain.fill(0)
    return ok
  } catch {
    return false
  }
}

/**
 * @param action copy | export | reveal
 * @param reason 展示给系统生物识别对话框的文案（macOS Touch ID）
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

  const row = readRow()
  if (!row) {
    return { ok: false, error: '尚未注册生物识别' }
  }
  const now = Date.now()
  if (row.locked_until > now) {
    const sec = Math.ceil((row.locked_until - now) / 1000)
    return { ok: false, error: `生物识别已锁定，请 ${sec} 秒后再试` }
  }

  let passed = false
  if (process.platform === 'darwin') {
    passed = await touchId.verify(reason)
  } else if (process.platform === 'win32') {
    // 先过可用性（safeStorage），再 DPAPI 解包证明
    if (!windowsHello.isAvailable()) {
      return { ok: false, error: 'Windows 安全存储不可用' }
    }
    passed = confirmViaDpapiEnrollment()
  } else {
    return { ok: false, error: '当前平台不支持生物识别确认' }
  }

  if (!passed) {
    bumpFail()
    return { ok: false, error: '生物识别未通过或校验失败' }
  }
  resetFail()
  return { ok: true }
}
