import Database from 'better-sqlite3'
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'
import * as vault from './crypto/vault'
import * as osCrypto from './crypto'
import { getDatabase } from '../db/connection'
import { MIGRATIONS, getCurrentVersion } from '../db/migrations'
import { decodeImage, encodeImage } from './storage/image-codec'

export type BackupMeta = { salt: Buffer; iv: Buffer; auth_tag: Buffer; encrypted_dek: Buffer; mode: string }
type Meta = BackupMeta
type Asset = { source: string; extension: string; sha256: string; encrypted: string | null; missing: number }
const MAX_ASSET = 32 * 1024 * 1024
const MAX_TOTAL = 512 * 1024 * 1024
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const hasAssets = (db: Database.Database): boolean => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_cv_backup_assets'").get()

/** 在数据库副本中封装加密原图；绝不修改活动库或原图。 */
export function addBackupAssets(path: string, portablePassword?: string): { images: number; missing: number } {
  const db = new Database(path)
  let key: Buffer | null = null
  try {
    db.pragma('journal_mode=DELETE')
    db.exec('CREATE TABLE IF NOT EXISTS _cv_backup_assets (source TEXT PRIMARY KEY, extension TEXT NOT NULL, sha256 TEXT NOT NULL, encrypted TEXT, missing INTEGER NOT NULL)')
    const rows = db.prepare("SELECT DISTINCT image_path AS source FROM clipboard_history WHERE image_path IS NOT NULL AND image_path<>''").all() as Array<{ source: string }>
    const insert = db.prepare('INSERT OR REPLACE INTO _cv_backup_assets VALUES (?,?,?,?,?)')
    let bytes = 0, missing = 0
    db.transaction(() => {
      for (const { source } of rows) {
        if (!existsSync(source)) { insert.run(source, '', '', null, 1); missing++; continue }
        const info = lstatSync(source)
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_ASSET) throw new Error('备份图片不是普通文件或超过 32 MB，原数据未改变')
        bytes += info.size
        if (bytes > MAX_TOTAL) throw new Error('图片附件超过本次备份 512 MB 上限，请先单独导出图片')
        const image = decodeImage(readFileSync(source), extname(source).toLowerCase())
        const extension = image.mime === 'image/jpeg' ? '.jpg' : `.${image.mime.split('/')[1]}`
        insert.run(source, extension, hash(image.bytes), vault.encryptWithDEK(image.bytes.toString('base64')), 0)
      }
    })()
    if (portablePassword !== undefined) {
      if (portablePassword.length < 12 || portablePassword.length > 1024) throw new Error('备份密码需要 12 到 1024 个字符')
      key = vault.getDEK()
      if (!key) throw new Error('请先解锁资料库')
      const salt = randomBytes(16), iv = randomBytes(12), kek = vault.deriveKey(portablePassword, salt)
      try {
        const cipher = createCipheriv('aes-256-gcm', kek, iv)
        const encrypted = Buffer.concat([cipher.update(key), cipher.final()])
        db.prepare("UPDATE vault_meta SET mode='password',salt=?,iv=?,auth_tag=?,encrypted_dek=?,kdf_params=? WHERE id=1").run(salt, iv, cipher.getAuthTag(), encrypted, JSON.stringify({ N: 16384, r: 8, p: 1 }))
      } finally { kek.fill(0) }
    }
    return { images: rows.length - missing, missing }
  } finally { key?.fill(0); db.close() }
}

export function backupKey(meta: Meta, password?: string): Buffer {
  const current = getDatabase().prepare('SELECT salt,iv,auth_tag,encrypted_dek,mode FROM vault_meta WHERE id=1').get() as Meta | undefined
  if (current && current.mode === meta.mode && ['salt', 'iv', 'auth_tag', 'encrypted_dek'].every(name => (current[name as keyof Meta] as Buffer).equals(meta[name as keyof Meta] as Buffer))) {
    const key = vault.getDEK()
    if (key) return key
  }
  if (meta.mode === 'safestorage') return osCrypto.decryptBuffer(meta.encrypted_dek)
  if (meta.mode !== 'password' || !password) throw new Error('该备份需要原主密码或导出时设置的备份密码')
  const kek = vault.deriveKey(password, meta.salt)
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, meta.iv)
    decipher.setAuthTag(meta.auth_tag)
    return Buffer.concat([decipher.update(meta.encrypted_dek), decipher.final()])
  } catch { throw new Error('备份密码错误或备份已损坏') } finally { kek.fill(0) }
}

/** 先验证临时副本并在新目录恢复图片，成功后调用方才能替换活动数据库。 */
export function prepareBackupRestore(path: string, imagesRoot: string, password?: string): { missing: number; created: string[] } {
  const db = new Database(path), created: string[] = []
  let key: Buffer | undefined
  try {
    db.pragma('trusted_schema=OFF')
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('备份完整性校验失败')
    if (getCurrentVersion(db) > (MIGRATIONS.at(-1)?.version ?? 0)) throw new Error('备份来自更高版本，请先使用匹配应用')
    const meta = db.prepare('SELECT salt,iv,auth_tag,encrypted_dek,mode FROM vault_meta WHERE id=1').get() as Meta | undefined
    if (!meta) throw new Error('备份缺少加密元数据')
    const rows = hasAssets(db) ? db.prepare('SELECT * FROM _cv_backup_assets').all() as Asset[] : []
    // 导入时即校验密码，不能替换后才发现无法解锁。
    key = backupKey(meta, password)
    if (key.length !== 32) throw new Error('备份密钥无效')
    let bytes = 0
    const root = join(imagesRoot, `restored-${randomUUID()}`)
    db.transaction(() => {
      for (const asset of rows) {
        if (asset.missing) continue
        if (!asset.encrypted || asset.encrypted.length > MAX_ASSET * 2) throw new Error('备份附件格式无效')
        const parts = asset.encrypted.split(':').map(part => Buffer.from(part, 'base64'))
        if (parts.length !== 3 || parts[0]?.length !== 12 || parts[1]?.length !== 16) throw new Error('备份附件格式无效')
        const decipher = createDecipheriv('aes-256-gcm', key!, parts[0]!)
        decipher.setAuthTag(parts[1]!)
        const raw = Buffer.from(Buffer.concat([decipher.update(parts[2]!), decipher.final()]).toString('utf8'), 'base64')
        bytes += raw.length
        if (raw.length > MAX_ASSET || bytes > MAX_TOTAL || hash(raw) !== asset.sha256) throw new Error('备份附件校验失败')
        if (!/^\.(png|jpe?g|webp|gif|bin)$/.test(asset.extension)) throw new Error('备份附件后缀无效')
        mkdirSync(root, { recursive: true, mode: 0o700 })
        const destination = join(root, `${randomUUID()}.cvimg`)
        writeFileSync(destination, encodeImage(decodeImage(raw, asset.extension), key), { flag: 'wx', mode: 0o600 }); created.push(destination)
        db.prepare('UPDATE clipboard_history SET image_path=? WHERE image_path=?').run(destination, asset.source)
      }
      if (hasAssets(db)) db.exec('DROP TABLE _cv_backup_assets')
    })()
    db.pragma('wal_checkpoint(TRUNCATE)')
    return { missing: rows.filter(row => row.missing).length, created }
  } catch (error) { for (const file of created) { try { unlinkSync(file) } catch { /* 仅回收本次生成的文件 */ } } throw error }
  finally { key?.fill(0); db.close() }
}
