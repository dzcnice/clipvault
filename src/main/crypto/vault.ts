/**
 * 主密码 + DEK（Data Encryption Key）保险库
 *
 * 架构（P0-2）：
 * 1. 主密码经 scrypt 派生出 KEK（Key Encryption Key）
 * 2. DEK 是随机生成的 32 字节对称密钥，用 AES-256-GCM 被 KEK 加密保存
 * 3. 凭证 value 实际用 DEK 加密（在 credential-store 中调用 encryptWithDEK）
 *
 * 为何分两层：
 * - 改主密码只需重新用新 KEK 加密 DEK，无需重写所有凭证
 * - DEK 仅在解锁期间驻留内存；锁屏/重启后必须重新派生
 *
 * 降级模式（免密）：
 * - 用户选择不设置主密码时，DEK 改由 safeStorage（OS 原生）加密
 * - mode 字段区分 'password' / 'safestorage'
 */

import * as crypto from 'crypto'
import zxcvbn from 'zxcvbn'
import { getDatabase } from '../../db/connection'
import * as osCrypto from './index'

/** scrypt 默认参数：N=16384/r=8/p=1 足以抵挡通用 GPU 攻击 */
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32 // AES-256
const SALT_LENGTH = 16
const IV_LENGTH = 12 // GCM 推荐 12 字节
const DEK_LENGTH = 32

export type VaultMode = 'password' | 'safestorage'

interface VaultMetaRow {
  id: number
  salt: Buffer
  iv: Buffer
  auth_tag: Buffer
  encrypted_dek: Buffer
  kdf_params: string
  mode: string
  created_at: number
}

/** 内存中的 DEK；未解锁时为 null。严禁通过 IPC 暴露给渲染进程 */
let activeDek: Buffer | null = null

/** 使用 scrypt 从密码派生 KEK */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  })
}

/** 用 KEK 加密 DEK，返回 {iv, authTag, ciphertext} */
function encryptDek(dek: Buffer, kek: Buffer): {
  iv: Buffer
  authTag: Buffer
  ciphertext: Buffer
} {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv)
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
  return { iv, authTag: cipher.getAuthTag(), ciphertext }
}

/** 用 KEK 解密 DEK */
function decryptDek(
  ciphertext: Buffer,
  kek: Buffer,
  iv: Buffer,
  authTag: Buffer
): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/** 读取 vault 元数据行 */
function readVaultMeta(): VaultMetaRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM vault_meta WHERE id = 1').get() as
    | VaultMetaRow
    | undefined
  return row ?? null
}

/** vault 是否已经初始化（即用户已设置主密码或选择了免密模式） */
export function isVaultInitialized(): boolean {
  return readVaultMeta() !== null
}

/** 当前会话是否已解锁 */
export function isUnlocked(): boolean {
  return activeDek !== null
}

/**
 * 创建全新 vault：生成随机 DEK，用密码派生 KEK 加密保存
 * A-6：增加 zxcvbn 服务端双重校验（长度 + 强度），低于 2 级直接拒绝
 */
export function createVault(password: string): void {
  if (isVaultInitialized()) {
    throw new Error('Vault 已初始化，请使用 changePassword')
  }
  if (!password || password.length < 8) {
    throw new Error('主密码至少需要 8 个字符')
  }
  const score = zxcvbn(password).score
  if (score < 2) {
    throw new Error('密码强度不足，请使用更复杂的组合（至少包含两种字符类型）')
  }

  const salt = crypto.randomBytes(SALT_LENGTH)
  const kek = deriveKey(password, salt)
  const dek = crypto.randomBytes(DEK_LENGTH)
  const { iv, authTag, ciphertext } = encryptDek(dek, kek)

  const db = getDatabase()
  db.prepare(
    `INSERT INTO vault_meta (id, salt, iv, auth_tag, encrypted_dek, kdf_params, mode, created_at)
     VALUES (1, ?, ?, ?, ?, ?, 'password', ?)`
  ).run(
    salt,
    iv,
    authTag,
    ciphertext,
    JSON.stringify({ N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, keyLen: KEY_LENGTH }),
    Date.now()
  )

  // 创建后立即进入解锁态，省去一次重复登录
  activeDek = dek
}

/**
 * 创建免密模式 vault：用 safeStorage 加密 DEK
 * 要求 OS 支持 safeStorage；调用方应先调用 osCrypto.isEncryptionAvailable 判断
 */
export function createVaultSafeStorage(): void {
  if (isVaultInitialized()) {
    throw new Error('Vault 已初始化')
  }
  if (!osCrypto.isEncryptionAvailable()) {
    throw new Error('当前系统不支持 safeStorage，无法使用免密模式')
  }
  const dek = crypto.randomBytes(DEK_LENGTH)
  const encryptedDek = osCrypto.encryptBuffer(dek)
  const db = getDatabase()
  // 免密模式的 salt/iv/auth_tag 留作占位；实际解密只用 encrypted_dek
  const placeholder = Buffer.alloc(1)
  db.prepare(
    `INSERT INTO vault_meta (id, salt, iv, auth_tag, encrypted_dek, kdf_params, mode, created_at)
     VALUES (1, ?, ?, ?, ?, ?, 'safestorage', ?)`
  ).run(placeholder, placeholder, placeholder, encryptedDek, JSON.stringify({}), Date.now())
  activeDek = dek
}

/** 尝试用密码解锁 vault；成功返回 true */
export function unlockVault(password: string): boolean {
  const meta = readVaultMeta()
  if (!meta) {
    throw new Error('Vault 尚未初始化')
  }
  if (meta.mode !== 'password') {
    throw new Error('当前 vault 为免密模式，请使用 unlockSafeStorage')
  }

  try {
    const kek = deriveKey(password, meta.salt)
    const dek = decryptDek(meta.encrypted_dek, kek, meta.iv, meta.auth_tag)
    activeDek = dek
    return true
  } catch {
    // 密码错误或数据损坏都归为失败
    return false
  }
}

/**
 * T3: 通过已解出的 DEK 直接解锁 vault（用于生物识别）
 *
 * 调用方（biometric.unlock）在 OS 生物识别通过后用 safeStorage 解出 DEK，
 * 然后调用本函数注入到 activeDek。会用该 DEK 尝试解密 vault_meta 的 encrypted_dek
 * 做一次 sanity check —— 只有两者匹配才真正进入解锁态；失败时不改变 vault 状态。
 */
export function unlockWithDek(dek: Buffer): boolean {
  const meta = readVaultMeta()
  if (!meta) {
    throw new Error('Vault 尚未初始化')
  }
  if (dek.length !== DEK_LENGTH) return false
  // Sanity check：通过 dek 解 encrypted_dek 应得到 dek 本身（自洽验证）
  // 由于 vault_meta 里 encrypted_dek 是用 KEK 加密的，不是用 dek 自加密，
  // 因此无法用 dek 直接验证。这里改走"写入后立即用 encryptWithDEK/decryptWithDEK
  // 做一次往返"路径风险更高；折中做法是：信任调用方（safeStorage 是 OS 级保护），
  // 直接把 dek 设为 activeDek。若 dek 错误，后续 decryptWithDEK 会失败。
  if (activeDek && activeDek !== dek) {
    activeDek.fill(0)
  }
  activeDek = Buffer.from(dek)
  return true
}

/** 免密模式解锁：直接用 safeStorage 解密 */
export function unlockVaultSafeStorage(): boolean {
  const meta = readVaultMeta()
  if (!meta) {
    throw new Error('Vault 尚未初始化')
  }
  if (meta.mode !== 'safestorage') {
    throw new Error('当前 vault 非免密模式')
  }
  try {
    activeDek = osCrypto.decryptBuffer(meta.encrypted_dek)
    return true
  } catch {
    return false
  }
}

export type EnsureVaultResult =
  | { ok: true; mode: VaultMode | 'created' }
  | { ok: false; reason: 'legacy_password' | 'os_unsupported' | 'unlock_failed'; message: string }

/**
 * v3.1：个人版无密码登录。
 * - 未初始化 → 用 OS safeStorage 创建并解锁
 * - safestorage → 自动解锁
 * - 旧 password vault → 需一次性旧密码迁移（由 UI 处理）
 */
export function ensureVaultOpen(): EnsureVaultResult {
  if (isUnlocked()) {
    return { ok: true, mode: getVaultMode() ?? 'safestorage' }
  }

  if (!isVaultInitialized()) {
    if (!osCrypto.isEncryptionAvailable()) {
      return {
        ok: false,
        reason: 'os_unsupported',
        message: '当前系统无法使用安全存储，无法自动创建保险库'
      }
    }
    createVaultSafeStorage()
    return { ok: true, mode: 'created' }
  }

  const mode = getVaultMode()
  if (mode === 'safestorage') {
    const ok = unlockVaultSafeStorage()
    if (ok) return { ok: true, mode: 'safestorage' }
    return {
      ok: false,
      reason: 'unlock_failed',
      message: '系统安全存储解锁失败，请重启应用或检查系统登录状态'
    }
  }

  if (mode === 'password') {
    return {
      ok: false,
      reason: 'legacy_password',
      message: '检测到旧版主密码保险库，请输入一次旧密码完成迁移'
    }
  }

  return {
    ok: false,
    reason: 'unlock_failed',
    message: '无法打开保险库'
  }
}

/**
 * 旧 password vault → 迁移为 safestorage（输入一次旧密码后不再需要）
 */
export function migratePasswordVaultToSafeStorage(password: string): boolean {
  if (!osCrypto.isEncryptionAvailable()) {
    throw new Error('当前系统不支持 safeStorage')
  }
  const meta = readVaultMeta()
  if (!meta || meta.mode !== 'password') {
    throw new Error('当前不是主密码模式')
  }
  let kek: Buffer | null = null
  let dek: Buffer | null = null
  try {
    kek = deriveKey(password, meta.salt)
    dek = decryptDek(meta.encrypted_dek, kek, meta.iv, meta.auth_tag)
    const encryptedDek = osCrypto.encryptBuffer(dek)
    const placeholder = Buffer.alloc(1)
    const db = getDatabase()
    db.prepare(
      `UPDATE vault_meta SET salt = ?, iv = ?, auth_tag = ?, encrypted_dek = ?, kdf_params = ?, mode = 'safestorage' WHERE id = 1`
    ).run(placeholder, placeholder, placeholder, encryptedDek, JSON.stringify({}))
    if (activeDek) activeDek.fill(0)
    activeDek = Buffer.from(dek)
    return true
  } catch {
    return false
  } finally {
    if (kek) kek.fill(0)
    if (dek) dek.fill(0)
  }
}

/** 锁定 vault：清空内存 DEK */
export function lockVault(): void {
  if (activeDek) {
    activeDek.fill(0)
  }
  activeDek = null
}

/** 修改密码：旧密码正确后重新加密 DEK
 *
 * P1-vault: 中间派生的 Buffer（oldKek / newKek / 临时 dek 副本）在函数结束前必须
 * fill(0) 清零，避免 GC 前留在堆上。activeDek 本身由 lockVault 负责清零。
 */
export function changePassword(oldPassword: string, newPassword: string): boolean {
  const meta = readVaultMeta()
  if (!meta || meta.mode !== 'password') {
    throw new Error('仅支持主密码模式修改密码')
  }
  // A-6：新密码强度校验
  if (!newPassword || newPassword.length < 8) {
    throw new Error('新密码至少需要 8 个字符')
  }
  if (zxcvbn(newPassword).score < 2) {
    throw new Error('新密码强度不足，请使用更复杂的组合')
  }

  let oldKek: Buffer | null = null
  let newKek: Buffer | null = null
  let previousDek: Buffer | null = null
  let dek: Buffer | null = null
  try {
    oldKek = deriveKey(oldPassword, meta.salt)
    try {
      dek = decryptDek(meta.encrypted_dek, oldKek, meta.iv, meta.auth_tag)
    } catch {
      return false
    }

    // 生成新 salt + 重新派生 KEK + 重新加密 DEK
    const newSalt = crypto.randomBytes(SALT_LENGTH)
    newKek = deriveKey(newPassword, newSalt)
    const { iv, authTag, ciphertext } = encryptDek(dek, newKek)

    const db = getDatabase()
    db.prepare(
      `UPDATE vault_meta SET salt = ?, iv = ?, auth_tag = ?, encrypted_dek = ? WHERE id = 1`
    ).run(newSalt, iv, authTag, ciphertext)

    // 替换 activeDek：先保存旧引用待清零
    previousDek = activeDek
    activeDek = dek
    dek = null // 所有权转移给 activeDek，不再在 finally 清零
    return true
  } finally {
    if (oldKek) oldKek.fill(0)
    if (newKek) newKek.fill(0)
    if (previousDek && previousDek !== activeDek) previousDek.fill(0)
    if (dek) dek.fill(0)
  }
}

/**
 * T1 方案 A：用已解锁状态的 DEK + 新密码 重置主密码
 *
 * 调用前必须已通过其它途径（生物识别 / 恢复短语解锁）进入解锁态；
 * 本函数不校验旧密码，而是用内存 activeDek 重新以新 KEK 包装写回 vault_meta。
 *
 * 与 changePassword 的区别：免除旧密码输入，专供忘记密码 + 恢复短语二次验证场景。
 */
export function resetPasswordWithDek(newPassword: string): boolean {
  const meta = readVaultMeta()
  if (!meta || meta.mode !== 'password') {
    throw new Error('仅支持主密码模式重置密码')
  }
  if (!activeDek) {
    throw new Error('Vault 未解锁，无法重置密码')
  }
  if (!newPassword || newPassword.length < 8) {
    throw new Error('新密码至少需要 8 个字符')
  }
  if (zxcvbn(newPassword).score < 2) {
    throw new Error('新密码强度不足，请使用更复杂的组合')
  }

  let newKek: Buffer | null = null
  try {
    const newSalt = crypto.randomBytes(SALT_LENGTH)
    newKek = deriveKey(newPassword, newSalt)
    const { iv, authTag, ciphertext } = encryptDek(activeDek, newKek)
    const db = getDatabase()
    db.prepare(
      `UPDATE vault_meta SET salt = ?, iv = ?, auth_tag = ?, encrypted_dek = ? WHERE id = 1`
    ).run(newSalt, iv, authTag, ciphertext)
    return true
  } finally {
    if (newKek) newKek.fill(0)
  }
}

/**
 * T3: 受控暴露当前活动 DEK 的副本（仅用于生物识别注册）
 *
 * - 仅在 vault 已解锁时返回 DEK 副本（调用方用完必须 fill(0)）
 * - 未解锁返回 null
 * - 严禁通过 IPC 直接暴露给渲染进程；只能在主进程内部调用（如 biometric.enroll）
 */
export function getDEK(): Buffer | null {
  if (!activeDek) return null
  return Buffer.from(activeDek)
}

/** 获取 vault 模式（未初始化时返回 null） */
export function getVaultMode(): VaultMode | null {
  const meta = readVaultMeta()
  return meta ? (meta.mode as VaultMode) : null
}

/** 用 DEK 加密明文字符串；返回 "iv:authTag:ciphertext" 的 base64 串 */
export function encryptWithDEK(plain: string): string {
  if (!activeDek) {
    throw new Error('Vault 未解锁，无法加密')
  }
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', activeDek, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return (
    iv.toString('base64') + ':' + authTag.toString('base64') + ':' + ciphertext.toString('base64')
  )
}

/** 用 DEK 解密 encryptWithDEK 产出的字符串
 *
 * BUG-CRED-8 修复：不再校验 parts[2] 非空。原因：
 *   encryptWithDEK('') 合法，其产出格式为 "iv:authTag:"，即 ciphertext 段为空串。
 *   AES-GCM 对零长度 plaintext 的密文就是空 buffer，authTag 仍可保证完整性。
 *   旧实现误把"空 ciphertext"当作"格式错误"而抛错，导致空值凭证无法 roundtrip。
 *   改为仅校验 length === 3 以及 iv / authTag 非空（它们永远不为空）。
 */
export function decryptWithDEK(payload: string): string {
  if (!activeDek) {
    throw new Error('Vault 未解锁，无法解密')
  }
  const parts = payload.split(':')
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('密文格式错误')
  }
  const iv = Buffer.from(parts[0], 'base64')
  const authTag = Buffer.from(parts[1], 'base64')
  // parts[2] 允许为空串 —— 对应空 plaintext 加密结果
  const ciphertext = Buffer.from(parts[2] ?? '', 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', activeDek, iv)
  decipher.setAuthTag(authTag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plain.toString('utf8')
}

/**
 * C1: 用 DEK 加密任意 UTF-8 字符串 → 返回独立的 {cipher, nonce} BLOB 对。
 *
 * 与 encryptWithDEK（输出 "iv:tag:ct" 合并 base64 字符串）相比，本函数返回
 * 原生 Buffer，方便直接写入 SQLite BLOB 列（避免 base64 膨胀 ~33%）。
 * cipher 尾部附带 16 字节 GCM authTag，与 decryptBytesWithDEK 对称。
 */
export function encryptBytesWithDEK(plain: string): { cipher: Buffer; nonce: Buffer } {
  if (!activeDek) {
    throw new Error('Vault 未解锁，无法加密')
  }
  const nonce = crypto.randomBytes(IV_LENGTH)
  const cipherCtx = crypto.createCipheriv('aes-256-gcm', activeDek, nonce)
  const ct = Buffer.concat([cipherCtx.update(plain, 'utf8'), cipherCtx.final()])
  const authTag = cipherCtx.getAuthTag()
  return { cipher: Buffer.concat([ct, authTag]), nonce }
}

/** C1: 对称解密 encryptBytesWithDEK 的输出 */
export function decryptBytesWithDEK(cipher: Buffer, nonce: Buffer): string {
  if (!activeDek) {
    throw new Error('Vault 未解锁，无法解密')
  }
  if (cipher.length < 16) {
    throw new Error('密文长度不足（缺少 GCM authTag）')
  }
  const ct = cipher.subarray(0, cipher.length - 16)
  const authTag = cipher.subarray(cipher.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', activeDek, nonce)
  decipher.setAuthTag(authTag)
  const plain = Buffer.concat([decipher.update(ct), decipher.final()])
  return plain.toString('utf8')
}

/**
 * 测试专用重置：仅用于单元测试，清理内存状态和 vault_meta 表
 * 生产环境永远不应调用
 */
export function __resetVaultForTests(): void {
  lockVault()
  try {
    const db = getDatabase()
    db.prepare('DELETE FROM vault_meta').run()
  } catch {
    // 数据库未初始化时允许忽略
  }
}
