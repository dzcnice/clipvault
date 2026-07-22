/**
 * 凭证 TOTP 存储（Sprint 11 · TASK-057）
 *
 * secret 使用 vault DEK 加密；仅在 vault 已解锁时才能存取明文。
 */

import { getDatabase } from './connection'
import * as vault from '../main/crypto/vault'
import { logger } from '../main/utils/logger'
import type { TOTPConfig, TOTPUpsertInput, TOTPAlgorithm } from '../types/totp'

interface TOTPRow {
  credential_id: string
  secret_encrypted: string
  issuer: string | null
  account: string | null
  algorithm: string
  digits: number
  period: number
  created_at: number
  updated_at: number
}

function rowToConfig(row: TOTPRow): TOTPConfig {
  const secret = vault.decryptWithDEK(row.secret_encrypted)
  return {
    credentialId: row.credential_id,
    secret,
    issuer: row.issuer ?? undefined,
    account: row.account ?? undefined,
    algorithm: (row.algorithm as TOTPAlgorithm) || 'SHA1',
    digits: (row.digits === 8 ? 8 : 6) as 6 | 8,
    period: row.period || 30,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** upsert TOTP 记录。vault 必须已解锁 */
export function upsertTOTP(input: TOTPUpsertInput): TOTPConfig {
  if (!vault.isUnlocked()) {
    throw new Error('Vault 未解锁，无法保存 TOTP secret')
  }
  const db = getDatabase()
  const now = Date.now()
  const algorithm = input.algorithm ?? 'SHA1'
  const digits = (input.digits === 8 ? 8 : 6) as 6 | 8
  const period = input.period ?? 30
  const encrypted = vault.encryptWithDEK(input.secret)

  const existing = db
    .prepare('SELECT created_at FROM credential_totp WHERE credential_id = ?')
    .get(input.credentialId) as { created_at: number } | undefined

  if (existing) {
    db.prepare(
      `UPDATE credential_totp
         SET secret_encrypted = ?, issuer = ?, account = ?, algorithm = ?, digits = ?, period = ?, updated_at = ?
         WHERE credential_id = ?`
    ).run(
      encrypted,
      input.issuer ?? null,
      input.account ?? null,
      algorithm,
      digits,
      period,
      now,
      input.credentialId
    )
  } else {
    db.prepare(
      `INSERT INTO credential_totp
         (credential_id, secret_encrypted, issuer, account, algorithm, digits, period, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.credentialId,
      encrypted,
      input.issuer ?? null,
      input.account ?? null,
      algorithm,
      digits,
      period,
      now,
      now
    )
  }

  return {
    credentialId: input.credentialId,
    secret: input.secret,
    issuer: input.issuer,
    account: input.account,
    algorithm,
    digits,
    period,
    createdAt: existing?.created_at ?? now,
    updatedAt: now
  }
}

/** 读取一条 TOTP（vault 未解锁时返回 null 并记警告） */
export function getTOTP(credentialId: string): TOTPConfig | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM credential_totp WHERE credential_id = ?')
    .get(credentialId) as TOTPRow | undefined
  if (!row) return null
  if (!vault.isUnlocked()) {
    logger.warn('[credential-totp-store] vault 未解锁，无法解密 TOTP secret')
    return null
  }
  try {
    return rowToConfig(row)
  } catch (err) {
    logger.error('[credential-totp-store] TOTP 解密失败:', err)
    return null
  }
}

/** 删除 */
export function deleteTOTP(credentialId: string): boolean {
  const db = getDatabase()
  const res = db
    .prepare('DELETE FROM credential_totp WHERE credential_id = ?')
    .run(credentialId)
  return res.changes > 0
}

/** 检查是否存在（不解密） */
export function hasTOTP(credentialId: string): boolean {
  const db = getDatabase()
  const row = db
    .prepare('SELECT credential_id FROM credential_totp WHERE credential_id = ?')
    .get(credentialId)
  return !!row
}

/** 列表项：含凭证名，secret 仅 vault 解锁时可解密 */
export interface TOTPListItem extends TOTPConfig {
  credentialName: string
}

/**
 * 列出全部 TOTP（目标形态：一页总览用）。
 * vault 未解锁时仍返回元数据但 secret 为空串，generate 会失败直至解锁。
 */
export function listAllTOTP(): TOTPListItem[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT t.*, c.name AS credential_name
       FROM credential_totp t
       LEFT JOIN credentials c ON c.id = t.credential_id
       ORDER BY c.name COLLATE NOCASE ASC`
    )
    .all() as Array<TOTPRow & { credential_name: string | null }>

  const unlocked = vault.isUnlocked()
  return rows.map((row) => {
    let secret = ''
    if (unlocked) {
      try {
        secret = vault.decryptWithDEK(row.secret_encrypted)
      } catch {
        secret = ''
      }
    }
    return {
      credentialId: row.credential_id,
      credentialName: row.credential_name || row.credential_id,
      secret,
      issuer: row.issuer ?? undefined,
      account: row.account ?? undefined,
      algorithm: (row.algorithm as TOTPAlgorithm) || 'SHA1',
      digits: (row.digits === 8 ? 8 : 6) as 6 | 8,
      period: row.period || 30,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  })
}
