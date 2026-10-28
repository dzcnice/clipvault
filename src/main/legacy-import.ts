import { app } from 'electron'
import Database from 'better-sqlite3'
import { execFile } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { decodeImage } from './storage/image-codec'
import { backupKey, type BackupMeta } from './backup-assets'

/**
 * 从原版 ClipVault（3.x 免密保险库）导入。
 * 原版的数据钥匙由 Electron safeStorage 加密：AES-256-GCM（v10 前缀），其密钥存放在原版资料目录的
 * Local State 里并受 Windows DPAPI 保护——只有同一 Windows 用户能解开。新版是另一个程序，
 * 所以在这里按同样的格式在本机解开，然后复用「旧资料合并」：原库只读、不覆盖现有记录、重复跳过。
 */
export const LEGACY_LIMITS = { maxImages: 5000, maxImageBytes: 32 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024 }
export interface LegacyProfile { dir: string; dbPath: string; bytes: number }

export function legacyProfileDir(): string { return join(dirname(app.getPath('userData')), 'clipvault') }

/** 原版资料目录存在且有数据库与 Local State 时返回位置。 */
export function detectLegacyProfile(dir = legacyProfileDir()): LegacyProfile | null {
  const dbPath = join(dir, 'clipvault.db')
  if (basename(dir).toLowerCase() === basename(app.getPath('userData')).toLowerCase()) return null
  if (!existsSync(dbPath) || !existsSync(join(dir, 'Local State'))) return null
  const info = lstatSync(dbPath)
  return info.isFile() && !info.isSymbolicLink() ? { dir, dbPath, bytes: info.size } : null
}

type Unprotect = (data: Buffer) => Promise<Buffer>
/** Windows DPAPI（当前用户）解密；通过系统自带的 Windows PowerShell 完成，不引入原生依赖。 */
export const unprotectDpapi: Unprotect = data => new Promise((resolve, reject) => {
  if (process.platform !== 'win32') { reject(new Error('从原版导入目前只支持 Windows')); return }
  const script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)))"
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const child = execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15_000, windowsHide: true, maxBuffer: 1 << 16 }, (error, stdout) => {
    if (error || !stdout.trim()) { reject(new Error('无法用当前 Windows 账户解开原版资料，请确认是同一用户登录')); return }
    resolve(Buffer.from(stdout.trim(), 'base64'))
  })
  child.stdin?.end(data.toString('base64'))
})

/** 读取原版 Local State 里的 os_crypt 密钥（DPAPI 保护）。 */
export async function chromiumKey(localState: string, unprotect: Unprotect = unprotectDpapi): Promise<Buffer> {
  const encoded = (JSON.parse(readFileSync(localState, 'utf8')) as { os_crypt?: { encrypted_key?: string } }).os_crypt?.encrypted_key
  if (!encoded) throw new Error('原版资料目录缺少系统加密信息')
  const wrapped = Buffer.from(encoded, 'base64')
  if (wrapped.subarray(0, 5).toString('latin1') !== 'DPAPI') throw new Error('原版加密信息格式无法识别')
  const key = await unprotect(wrapped.subarray(5))
  if (key.length !== 32) { key.fill(0); throw new Error('原版加密密钥无效') }
  return key
}

/** 解开 safeStorage 的 v10 密文：'v10' + 12 字节随机数 + 密文 + 16 字节校验。 */
export function decryptV10(blob: Buffer, key: Buffer): Buffer {
  if (blob.subarray(0, 3).toString('latin1') !== 'v10' || blob.length < 3 + 12 + 16) throw new Error('原版钥匙格式无法识别')
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(3, 15))
  decipher.setAuthTag(blob.subarray(-16))
  return Buffer.concat([decipher.update(blob.subarray(15, -16)), decipher.final()])
}

/** 原版数据钥匙（DEK）：免密模式由 safeStorage 包裹的 base64 字符串。 */
export async function legacyDek(profile: LegacyProfile, encryptedDek: Buffer, unprotect: Unprotect = unprotectDpapi): Promise<Buffer> {
  const key = await chromiumKey(join(profile.dir, 'Local State'), unprotect)
  try {
    const inner = decryptV10(encryptedDek, key)
    const dek = Buffer.from(inner.toString('utf8'), 'base64'); inner.fill(0)
    if (dek.length !== 32) { dek.fill(0); throw new Error('原版数据钥匙无效') }
    return dek
  } catch (error) { throw error instanceof Error && /钥匙|密钥/.test(error.message) ? error : new Error('原版资料无法解开：钥匙不匹配或文件已损坏') }
  finally { key.fill(0) }
}

/** 与「旧资料合并」相同的来源标识：同一份原版资料（同一把钥匙）合并过就会留下 merge:<标识>。 */
export function legacySourceIdentity(key: Buffer): string { return createHash('sha256').update(key).digest('hex') }

/**
 * 这份原版资料是否已经合并进当前资料库（包括以前手动转换备份后合并的情况）。
 * 只读原版的加密信息并在内存里解出钥匙；判断不了时返回 false。
 */
export async function legacyAlreadyMerged(profile: LegacyProfile, hasMergeIndex: (identity: string) => boolean, unprotect: Unprotect = unprotectDpapi): Promise<boolean> {
  let db: Database.Database | undefined, key: Buffer | undefined
  try {
    db = new Database(profile.dbPath, { readonly: true, fileMustExist: true })
    const meta = db.prepare('SELECT mode, encrypted_dek FROM vault_meta WHERE id=1').get() as { mode: string; encrypted_dek: Buffer } | undefined
    if (meta?.mode !== 'safestorage') return false
    key = await legacyDek(profile, Buffer.from(meta.encrypted_dek), unprotect)
    return hasMergeIndex(legacySourceIdentity(key))
  } catch { return false }
  finally { key?.fill(0); db?.close() }
}

function sealWith(key: Buffer, text: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64')).join(':')
}

export interface PreparedLegacy { path: string; workDir: string; key?: Buffer; mode: string; images: number; missingImages: number; cleanup: () => void }

/**
 * 在新版资料目录里做一份原版数据库的一致副本，把原版图片按合并格式封装进副本，
 * 返回可交给「旧资料合并」的副本路径与钥匙。原版目录只读，不做任何修改。
 */
export async function prepareLegacyImport(profile: LegacyProfile, options: { unprotect?: Unprotect; password?: string } = {}): Promise<PreparedLegacy> {
  const workDir = join(app.getPath('userData'), `legacy-import-${randomUUID()}`)
  mkdirSync(workDir, { recursive: true, mode: 0o700 })
  let key: Buffer | undefined
  const cleanup = (): void => { key?.fill(0); rmSync(workDir, { recursive: true, force: true }) }
  try {
    // 连同 WAL 一起复制，再在副本上 VACUUM INTO，得到包含已提交内容的单文件快照。
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(profile.dbPath + suffix)) copyFileSync(profile.dbPath + suffix, join(workDir, 'source.db' + suffix))
    const path = join(workDir, 'legacy.db')
    const source = new Database(join(workDir, 'source.db'), { fileMustExist: true })
    try {
      if (source.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('原版数据库完整性校验失败')
      source.prepare('VACUUM INTO ?').run(path)
    } finally { source.close() }
    for (const suffix of ['', '-wal', '-shm']) rmSync(join(workDir, 'source.db' + suffix), { force: true })
    const db = new Database(path)
    try {
      const meta = db.prepare('SELECT salt, iv, auth_tag, encrypted_dek, mode FROM vault_meta WHERE id=1').get() as BackupMeta | undefined
      if (!meta) throw new Error('原版资料没有加密信息，无法导入')
      if (meta.mode === 'password') {
        if (!options.password) throw new Error('原版设置了主密码，请输入原版主密码后再导入')
        key = backupKey(meta, options.password)
      } else if (meta.mode === 'safestorage') key = await legacyDek(profile, Buffer.from(meta.encrypted_dek), options.unprotect)
      else throw new Error('原版保险库模式无法识别')
      // 原版图片在资料目录的 images 里（多为明文，也可能已加密）：按原版钥匙读出，用同一钥匙封装进副本。
      db.exec('CREATE TABLE IF NOT EXISTS _cv_backup_assets (source TEXT PRIMARY KEY, extension TEXT NOT NULL, sha256 TEXT NOT NULL, encrypted TEXT, missing INTEGER NOT NULL)')
      const rows = db.prepare("SELECT DISTINCT image_path AS source FROM clipboard_history WHERE image_path IS NOT NULL AND image_path<>''").all() as Array<{ source: string }>
      if (rows.length > LEGACY_LIMITS.maxImages) throw new Error('原版图片过多，请先在原版里清理后再导入')
      const insert = db.prepare('INSERT OR REPLACE INTO _cv_backup_assets VALUES (?,?,?,?,?)')
      let images = 0, missing = 0, total = 0
      db.transaction(() => {
        for (const { source } of rows) {
          // 原版记录的是绝对路径；原目录被移动时，按文件名在原版 images 目录里找。
          const candidates = [source, join(profile.dir, 'images', basename(source))]
          const file = candidates.find(item => { try { const info = lstatSync(item); return info.isFile() && !info.isSymbolicLink() && info.size <= LEGACY_LIMITS.maxImageBytes } catch { return false } })
          if (!file) { insert.run(source, '', '', null, 1); missing++; continue }
          const image = decodeImage(readFileSync(file), extname(file).toLowerCase(), key)
          total += image.bytes.length
          if (total > LEGACY_LIMITS.maxTotalBytes) throw new Error('原版图片总量超过 512 MB，请先在原版里清理图片')
          insert.run(source, image.mime === 'image/jpeg' ? '.jpg' : `.${image.mime.split('/')[1]}`, createHash('sha256').update(image.bytes).digest('hex'), sealWith(key!, image.bytes.toString('base64')), 0)
          images++
        }
      })()
      return { path, workDir, key, mode: meta.mode, images, missingImages: missing, cleanup }
    } finally { db.close() }
  } catch (error) { cleanup(); throw error }
}
