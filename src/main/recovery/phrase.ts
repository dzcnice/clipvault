/**
 * Sprint 13 / TASK-071 BIP39 24 词恢复短语
 *
 * - 生成：`bip39.generateMnemonic(256)` → 24 词
 * - 存储：scrypt(N=2^17, r=8, p=1) 哈希；明文绝不落库
 * - 重置主密码：验证通过后派生一个临时密码 → createVault 前需要先清掉旧 vault，
 *   这里 S13 范围仅支持 "在 vault 已删除情况下用恢复短语重建" +
 *   "已登录场景下的 changePassword"。
 */

import * as crypto from 'crypto'
import * as bip39 from 'bip39'
import { getDatabase } from '../../db/connection'
import * as vault from '../crypto/vault'

const SCRYPT_N = 1 << 17 // 131072
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const SALT_LEN = 16

interface RecoveryRow {
  id: number
  hash: Buffer
  salt: Buffer
  kdf_params: string
  created_at: number
  last_verified_at: number | null
}

function readRow(): RecoveryRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM recovery_phrase WHERE id = 1').get() as
    | RecoveryRow
    | undefined
  return row ?? null
}

export function isEnrolled(): boolean {
  return readRow() !== null
}

export function lastVerifiedAt(): number | null {
  return readRow()?.last_verified_at ?? null
}

/** 生成并保存恢复短语；返回 24 个词明文（仅返回一次） */
export function setupRecoveryPhrase(): string[] {
  const mnemonic = bip39.generateMnemonic(256) // 24 词
  const words = mnemonic.trim().split(/\s+/)
  if (words.length !== 24) {
    throw new Error(`bip39 返回词数异常：${words.length}`)
  }

  const salt = crypto.randomBytes(SALT_LEN)
  const hash = crypto.scryptSync(mnemonic, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024
  })

  const db = getDatabase()
  const now = Date.now()
  db.prepare(
    `INSERT INTO recovery_phrase (id, hash, salt, kdf_params, created_at, last_verified_at)
     VALUES (1, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       hash = excluded.hash,
       salt = excluded.salt,
       kdf_params = excluded.kdf_params,
       created_at = excluded.created_at,
       last_verified_at = NULL`
  ).run(
    hash,
    salt,
    JSON.stringify({ N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, keyLen: KEY_LEN }),
    now
  )

  return words
}

/** 校验用户输入的 24 词是否与保存的 hash 匹配 */
export function verifyMnemonic(words: string[]): boolean {
  if (!Array.isArray(words) || words.length !== 24) return false
  const mnemonic = words.map((w) => w.trim().toLowerCase()).join(' ')
  if (!bip39.validateMnemonic(mnemonic)) return false

  const row = readRow()
  if (!row) return false
  const params = JSON.parse(row.kdf_params) as {
    N: number
    r: number
    p: number
    keyLen: number
  }
  const candidate = crypto.scryptSync(mnemonic, row.salt, params.keyLen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * 1024 * 1024
  })
  const ok =
    candidate.length === row.hash.length &&
    crypto.timingSafeEqual(candidate, row.hash)

  if (ok) {
    getDatabase()
      .prepare('UPDATE recovery_phrase SET last_verified_at = ? WHERE id = 1')
      .run(Date.now())
  }
  return ok
}

/**
 * 用恢复短语重置主密码（T1 方案 A · 真实现）：
 *
 * 流程：
 *   1. 校验短语 hash
 *   2. 要求 vault 已解锁（通过生物识别或旧密码）
 *   3. 调用 vault.resetPasswordWithDek(newPassword) —— 用 activeDek 重新以新 KEK
 *      加密写回 vault_meta，旧密码从此失效
 *
 * 约束：仅支持 "用户忘记密码 → 先通过生物识别解锁 → 恢复短语二次验证 → 重置主密码" 链路。
 * 恢复短语本身不是数据备份，无法恢复已删除凭证。
 */
export function resetPasswordWithPhrase(
  words: string[],
  newPassword: string
): { success: boolean; error?: string } {
  if (!verifyMnemonic(words)) {
    return { success: false, error: '恢复短语验证失败' }
  }
  if (!vault.isUnlocked()) {
    return {
      success: false,
      error: '需要先通过生物识别或其它方式解锁后再重置密码'
    }
  }
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: '新密码至少 8 字符' }
  }
  try {
    const ok = vault.resetPasswordWithDek(newPassword)
    if (!ok) {
      return { success: false, error: '主密码重置失败，请重试' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export function disableRecovery(): void {
  getDatabase().prepare('DELETE FROM recovery_phrase WHERE id = 1').run()
}

/** 测试钩子 */
export function __resetForTests(): void {
  try {
    getDatabase().prepare('DELETE FROM recovery_phrase').run()
  } catch {
    // ignore
  }
}
