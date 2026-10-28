import Database from 'better-sqlite3'
import { createHash, createDecipheriv, randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase } from '../db/connection'
import { getCurrentVersion, MIGRATIONS } from '../db/migrations'
import * as vault from './crypto/vault'
import { backupKey, type BackupMeta } from './backup-assets'
import { encodeImage, decodeImage } from './storage/image-codec'
import { getDefaultImagesDir } from './prefs'
import { performBackup } from './backup'

type Row = Record<string, string | number | Buffer | null>
export interface MergeSummary { clipboard: number; credentials: number; resources: number; projects: number; skipped: number; missingImages: number }
const exists = (db: Database.Database, table: string): boolean => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')

export function openMergeBackup(path: string, password?: string): { preview: MergeSummary; merge: () => MergeSummary; close: () => void } {
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 768 * 1024 * 1024) throw new Error('备份必须是 768 MB 以内的普通文件')
  const source = new Database(path, { readonly: true, fileMustExist: true })
  let key: Buffer | undefined, closed = false
  const close = (): void => { if (!closed) { closed = true; key?.fill(0); source.close() } }
  try {
    source.pragma('trusted_schema=OFF'); source.pragma('query_only=ON'); source.exec('BEGIN')
    if (source.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('备份完整性校验失败')
    if (getCurrentVersion(source) > (MIGRATIONS.at(-1)?.version ?? 0)) throw new Error('备份版本高于当前应用')
    const meta = source.prepare('SELECT salt,iv,auth_tag,encrypted_dek,mode FROM vault_meta WHERE id=1').get() as BackupMeta | undefined
    if (!meta) throw new Error('备份缺少加密信息')
    key = backupKey(meta, password)
    if (key.length !== 32) throw new Error('备份密钥无效')
    const decrypt = (payload: string): string => {
      const parts = payload.split(':').map(value => Buffer.from(value, 'base64'))
      if (parts.length !== 3 || parts[0]!.length !== 12 || parts[1]!.length !== 16) throw new Error('备份密文格式错误')
      const cipher = createDecipheriv('aes-256-gcm', key!, parts[0]!); cipher.setAuthTag(parts[1]!)
      return Buffer.concat([cipher.update(parts[2]!), cipher.final()]).toString('utf8')
    }
    const decryptBlob = (cipher: Buffer, nonce: Buffer): string => {
      const decoder = createDecipheriv('aes-256-gcm', key!, nonce); decoder.setAuthTag(cipher.subarray(-16))
      return Buffer.concat([decoder.update(cipher.subarray(0, -16)), decoder.final()]).toString('utf8')
    }
    const tables = new Map<string, Row[]>()
    let totalRows = 0
    const rows = (table: string): Row[] => {
      const cached = tables.get(table)
      if (cached) return cached
      const values = exists(source, table) ? source.prepare(`SELECT * FROM ${table} LIMIT 100001`).all() as Row[] : []
      totalRows += values.length
      if (values.length > 100_000 || totalRows > 300_000) throw new Error('备份记录过多，请分批导入')
      tables.set(table, values)
      return values
    }
    const grouped = (table: string, column: string): Map<string, Row[]> => {
      const groups = new Map<string, Row[]>()
      for (const row of rows(table)) {
        const id = String(row[column]), group = groups.get(id) ?? []
        group.push(row); groups.set(id, group)
      }
      return groups
    }
    const credentialTags = grouped('credential_tags', 'credential_id')
    const credentialTotp = grouped('credential_totp', 'credential_id')
    const clipboardTags = grouped('clipboard_tags', 'clipboard_id')
    const occurrences = grouped('clipboard_occurrences', 'clipboard_id')
    const resourceFields = grouped('wb_resource_fields', 'resource_id')
    const clips = rows('clipboard_history'), credentials = rows('credentials'), projects = rows('wb_projects').filter(row => row.id !== 'quick-ask'), resources = rows('wb_resources')
    if (clips.length + credentials.length + resources.length > 100_000) throw new Error('备份记录过多，请分批导入')
    // Preflight authenticates every selected encrypted record before the confirmation dialog or destination writes.
    for (const row of credentials) if (row.value_encrypted === 1) decrypt(String(row.value))
    for (const row of clips) for (const prefix of ['content', 'preview']) if (row[`${prefix}_encrypted`]) decryptBlob(row[`${prefix}_encrypted`] as Buffer, row[`${prefix}_nonce`] as Buffer)
    for (const row of [...projects, ...resources]) decrypt(String(row.data))
    for (const row of rows('wb_resource_fields')) decrypt(String(row.value_encrypted))
    for (const row of rows('credential_totp')) decrypt(String(row.secret_encrypted))
    const assets = new Map(rows('_cv_backup_assets').map(row => [String(row.source), row]))
    const preview: MergeSummary = { clipboard: clips.length, credentials: credentials.length, projects: projects.length, resources: resources.length, skipped: 0,
      missingImages: clips.filter(row => row.type === 'image' && !row.image_data && (!assets.get(String(row.image_path))?.encrypted)).length }
    const sourceIdentity = digest(key)
    return { preview, close, merge: () => {
      if (closed) throw new Error('导入已关闭')
      const backup = performBackup()
      if (!backup.success) throw new Error('合并前备份失败，当前数据未改变')
      const db = getDatabase(), created: string[] = [], inserted = new Set<string>()
      const summary: MergeSummary = { clipboard: 0, credentials: 0, resources: 0, projects: 0, skipped: 0, missingImages: preview.missingImages }
      const indexKey = `merge:${sourceIdentity}`
      const previous = db.prepare('SELECT data FROM wb_settings WHERE key=?').get(indexKey) as { data: string } | undefined
      const index: Record<string, string> = previous ? JSON.parse(vault.decryptWithDEK(previous.data)) : {}
      const mapping = new Map<string, string>()
      const columnCache = new Map<string, string[]>()
      const insert = (table: string, row: Row): void => {
        let schema = columnCache.get(table)
        if (!schema) { schema = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(value => value.name); columnCache.set(table, schema) }
        const columns = schema.filter(name => Object.hasOwn(row, name))
        db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(name => row[name] as string | number | Buffer | null))
      }
      const copy = (table: string, row: Row, transform: (next: Row) => void, count?: keyof MergeSummary): void => {
        const id = String(row.id)
        const related = table === 'credentials' ? [...credentialTotp.get(id) ?? [], ...credentialTags.get(id) ?? []]
          : table === 'clipboard_history' ? [...clipboardTags.get(id) ?? [], ...occurrences.get(id) ?? []]
            : table === 'wb_resources' ? resourceFields.get(id) ?? [] : []
        const identity = `${table}:${row.id}:${digest(JSON.stringify([row, related]))}`
        const prior = index[identity]
        if (prior && db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(prior)) { mapping.set(`${table}:${row.id}`, prior); summary.skipped++; return }
        const next = { ...row, id: randomUUID() }
        transform(next); insert(table, next); inserted.add(`${table}:${next.id}`)
        index[identity] = String(next.id); mapping.set(`${table}:${row.id}`, String(next.id))
        if (count) summary[count]++
      }
      try {
        db.transaction(() => {
          const categories = rows('categories')
          for (const row of categories) copy('categories', row, next => { next.parent_id = null })
          for (const row of categories) {
            const id = mapping.get(`categories:${row.id}`)
            if (id && inserted.has(`categories:${id}`) && row.parent_id) db.prepare('UPDATE categories SET parent_id=? WHERE id=?').run(mapping.get(`categories:${row.parent_id}`) ?? null, id)
          }
          for (const row of credentials) copy('credentials', row, next => { next.value = vault.encryptWithDEK(row.value_encrypted === 1 ? decrypt(String(row.value)) : String(row.value)); next.value_encrypted = 1; next.workspace = 'personal'; next.category_id = mapping.get(`categories:${row.category_id}`) ?? null }, 'credentials')
          for (const row of rows('credential_totp')) { const id = mapping.get(`credentials:${row.credential_id}`); if (id && inserted.has(`credentials:${id}`)) insert('credential_totp', { ...row, credential_id: id, secret_encrypted: vault.encryptWithDEK(decrypt(String(row.secret_encrypted))) }) }
          for (const row of clips) copy('clipboard_history', row, next => {
            for (const prefix of ['content', 'preview']) {
              const plain = row[`${prefix}_encrypted`] ? decryptBlob(row[`${prefix}_encrypted`] as Buffer, row[`${prefix}_nonce`] as Buffer) : String(row[prefix] ?? '')
              const encrypted = vault.encryptBytesWithDEK(plain); next[`${prefix}_encrypted`] = encrypted.cipher; next[`${prefix}_nonce`] = encrypted.nonce; next[prefix] = prefix === 'preview' ? '' : null
            }
            next.content_plaintext_legacy = 0; next.workspace = 'personal'; next.saved_from_id = null; next.snippet_shortcut = null
            next.image_path = null; next.image_data = null
            const asset = assets.get(String(row.image_path))
            let image: { bytes: Buffer; mime: string } | undefined
            if (asset?.encrypted) {
              const raw = Buffer.from(decrypt(String(asset.encrypted)), 'base64')
              if (raw.length > 32 * 1024 * 1024 || digest(raw) !== asset.sha256) throw new Error('备份图片完整性校验失败')
              image = decodeImage(raw, String(asset.extension))
            } else if (typeof row.image_data === 'string') {
              const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(row.image_data)
              if (match) image = { mime: match[1]!, bytes: Buffer.from(match[2]!, 'base64') }
            }
            if (image) { const root = join(getDefaultImagesDir(), 'imported'); mkdirSync(root, { recursive: true, mode: 0o700 }); const path = join(root, `${randomUUID()}.cvimg`); writeFileSync(path, encodeImage(image), { flag: 'wx', mode: 0o600 }); created.push(path); next.image_path = path }
          }, 'clipboard')
          for (const row of rows('clipboard_occurrences')) {
            const id = mapping.get(`clipboard_history:${row.clipboard_id}`)
            if (id && inserted.has(`clipboard_history:${id}`)) {
              const next: Row = { ...row, clipboard_id: id }; delete next.id
              insert('clipboard_occurrences', next)
            }
          }
          for (const [table, parent, column] of [['credential_tags', 'credentials', 'credential_id'], ['clipboard_tags', 'clipboard_history', 'clipboard_id']] as const) {
            for (const row of rows(table)) { const id = mapping.get(`${parent}:${row[column]}`); if (id && inserted.has(`${parent}:${id}`)) insert(table, { ...row, [column]: id }) }
          }
          for (const row of rows('tags')) db.prepare('INSERT OR IGNORE INTO tags (name,color,use_count) VALUES (?,?,?)').run(row.name, row.color, row.use_count)
          for (const row of projects) copy('wb_projects', row, next => { next.data = vault.encryptWithDEK(decrypt(String(row.data))) }, 'projects')
          for (const row of resources) copy('wb_resources', row, next => { next.data = vault.encryptWithDEK(decrypt(String(row.data))); next.project_id = mapping.get(`wb_projects:${row.project_id}`) ?? null; next.legacy_credential_id = null }, 'resources')
          for (const row of rows('wb_resource_fields')) { const id = mapping.get(`wb_resources:${row.resource_id}`); if (id && inserted.has(`wb_resources:${id}`)) insert('wb_resource_fields', { ...row, resource_id: id, value_encrypted: vault.encryptWithDEK(decrypt(String(row.value_encrypted))) }) }
          db.prepare('INSERT INTO wb_settings (key,data) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(indexKey, vault.encryptWithDEK(JSON.stringify(index)))
        })()
        return summary
      } catch (error) { for (const path of created) { try { unlinkSync(path) } catch { /* only files created by this attempt */ } } throw error }
      finally { close() }
    } }
  } catch (error) { close(); throw error }
}
