/**
 * Sprint 13 / TASK-067 生物识别解锁核心（T3 已修复：存 DEK 而非主密码）
 *
 * 策略：
 *   - enroll：用户在已解锁状态下注册；从 vault.getDEK() 取出 DEK 副本，
 *     用 safeStorage（OS DPAPI / Keychain）包装后存 `biometric_enrollment.encrypted_dek`
 *   - unlock：macOS 走 Touch ID；Windows 仅校验当前用户 DPAPI 能解开已注册 DEK
 *     （无 Hello 弹窗）→ vault.unlockWithDek(dek)；主密码**永远不落盘**
 *
 * 失败计数（P1）：只在 unlock 成功时清零；失败累计到 BIOMETRIC_MAX_FAIL 后
 * 直接锁死 BIOMETRIC_LOCK_MS，锁定期满后继续累计，不重置计数，防止暴力 5 次/周期。
 */

import { getDatabase } from '../../db/connection'
import { backfillClipboardEncryption } from '../../db/clipboard-store'
import * as osCrypto from '../crypto'
import * as vault from '../crypto/vault'
import { windowsHello } from './windows-hello'
import { touchId } from './touch-id'
import {
  BIOMETRIC_LOCK_MS,
  BIOMETRIC_MAX_FAIL,
  type BiometricEnrollmentRow
} from './types'
import type {
  BiometricAvailability,
  BiometricEnrollResult,
  BiometricPlatform,
  BiometricUnlockResult
} from '../../types/biometric'

function platformOf(): BiometricPlatform {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  if (process.platform === 'linux') return 'linux'
  return 'other'
}

function mechanism(): 'dpapi' | 'touch-id' | 'unsupported' {
  if (process.platform === 'win32' && windowsHello.isAvailable()) return 'dpapi'
  if (process.platform === 'darwin' && touchId.isAvailable()) return 'touch-id'
  return 'unsupported'
}

function readRow(): BiometricEnrollmentRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM biometric_enrollment WHERE id = 1').get() as
    | BiometricEnrollmentRow
    | undefined
  return row ?? null
}

export function getAvailability(): BiometricAvailability {
  const m = mechanism()
  return {
    isAvailable: m !== 'unsupported',
    mechanism: m,
    platform: platformOf(),
    enrolled: readRow() !== null
  }
}

async function verifyBiometricGesture(reason: string): Promise<boolean> {
  if (process.platform === 'win32') return windowsHello.verify(reason)
  if (process.platform === 'darwin') return touchId.verify(reason)
  return false
}

/**
 * 注册（T3 修复后）：
 * - 要求 vault 已解锁（由调用方先用主密码 unlockVault）
 * - 从 vault.getDEK() 取 DEK 副本 → safeStorage 包装 → 落库
 * - 密码本身**不再保存**；DEK 副本用完立即清零
 *
 * 参数 `password` 保留是为了向后兼容旧 IPC 签名；
 * 若传入了密码且 vault 未解锁，会先尝试用它解锁一次。
 */
export async function enroll(password: string): Promise<BiometricEnrollResult> {
  const m = mechanism()
  if (m === 'unsupported') {
    return { success: false, error: '当前平台不支持生物识别解锁' }
  }

  // 若 vault 未解锁，则尝试用传入密码解锁（兼容旧 UI）
  if (!vault.isUnlocked()) {
    if (!password) {
      return { success: false, error: '需要先解锁 vault 或提供主密码' }
    }
    const modeVault = vault.getVaultMode()
    let ok = false
    try {
      if (modeVault === 'safestorage') {
        ok = vault.unlockVaultSafeStorage()
      } else {
        ok = vault.unlockVault(password)
      }
    } catch {
      ok = false
    }
    if (!ok) {
      return { success: false, error: '主密码校验失败' }
    }
  }

  const dek = vault.getDEK()
  if (!dek) {
    return { success: false, error: 'vault 未解锁，无法获取 DEK' }
  }

  let enc: Buffer
  try {
    // safeStorage.encryptString 期望字符串；这里把 DEK 转 base64 作为字符串载体
    enc = osCrypto.encryptBuffer(Buffer.from(dek.toString('base64'), 'utf8'))
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    dek.fill(0)
  }

  const now = Date.now()
  const db = getDatabase()
  db.prepare(
    `INSERT INTO biometric_enrollment (id, mechanism, encrypted_dek, created_at, updated_at, fail_count, locked_until)
     VALUES (1, ?, ?, ?, ?, 0, 0)
     ON CONFLICT(id) DO UPDATE SET
       mechanism = excluded.mechanism,
       encrypted_dek = excluded.encrypted_dek,
       updated_at = excluded.updated_at,
       fail_count = 0,
       locked_until = 0`
  ).run(m, enc, now, now)

  return { success: true }
}

function isLocked(row: BiometricEnrollmentRow, now = Date.now()): number {
  if (row.locked_until > now) return row.locked_until - now
  return 0
}

/**
 * P1 修复：失败计数只累加，成功才清零。
 * - 达到 BIOMETRIC_MAX_FAIL 时设置 locked_until = now + BIOMETRIC_LOCK_MS
 * - fail_count 持续累积，不在锁定后自动归零，避免 "每次锁定期结束后重置为 5 次机会" 的暴力空间
 */
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

export async function unlock(): Promise<BiometricUnlockResult> {
  const row = readRow()
  if (!row) {
    return { success: false, error: '尚未注册生物识别解锁' }
  }
  const lockedRemain = isLocked(row)
  if (lockedRemain > 0) {
    return {
      success: false,
      lockedForMs: lockedRemain,
      error: `已因多次失败锁定，请 ${Math.ceil(lockedRemain / 1000)} 秒后再试`
    }
  }

  const ok = await verifyBiometricGesture('解锁 ClipVault')
  if (!ok) {
    bumpFail()
    return { success: false, error: '生物识别未通过' }
  }

  // T3: 解出 DEK（base64 编码字符串包在 utf8 Buffer 里），注入到 vault.activeDek
  let dek: Buffer | null = null
  try {
    const buf = osCrypto.decryptBuffer(row.encrypted_dek)
    const b64 = buf.toString('utf8')
    dek = Buffer.from(b64, 'base64')
    buf.fill(0)
  } catch (err) {
    bumpFail()
    return { success: false, error: (err as Error).message }
  }

  let unlocked = false
  try {
    unlocked = vault.unlockWithDek(dek)
  } catch {
    unlocked = false
  } finally {
    dek.fill(0)
  }

  if (!unlocked) {
    bumpFail()
    return { success: false, error: '生物识别数据已失效，请重新注册' }
  }

  resetFail()
  // C1 · 生物识别解锁成功后也触发剪贴板明文回填（与 vault-handlers 同策略）
  void backfillClipboardEncryption().catch(() => {
    /* 静默失败 —— 下次解锁会再次尝试 */
  })
  return { success: true }
}

export function disable(): void {
  const db = getDatabase()
  db.prepare('DELETE FROM biometric_enrollment WHERE id = 1').run()
}

/** 测试钩子 */
export function __resetForTests(): void {
  try {
    const db = getDatabase()
    db.prepare('DELETE FROM biometric_enrollment').run()
  } catch {
    // ignore
  }
}
