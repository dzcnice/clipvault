/**
 * 剪贴板数据存储层 · v3.1 personal
 * workspace 固定 personal；content 加密 + legacy backfill
 */

import { v4 as uuidv4 } from 'uuid'
import * as crypto from 'crypto'
import { getDatabase, transaction } from './connection'
import * as imageStore from '../main/storage/image-store'
import * as vault from '../main/crypto/vault'
import type {
  ClipboardFilter,
  ClipboardItem,
  CreateClipboardItemInput,
  CreateSnippetInput,
  UpdateSnippetInput,
  WorkspaceContext
} from '../types'

export const E_VAULT_LOCKED = 'E_VAULT_LOCKED'

interface CodedError extends Error {
  code?: string
}

interface ClipboardRow {
  id: string
  type: string
  content: string | null
  image_data: string | null
  image_path: string | null
  file_path: string | null
  preview: string | null
  hash: string
  size: number
  source_app: string | null
  is_pinned: number
  is_snippet: number
  snippet_name: string | null
  snippet_shortcut: string | null
  detected_key_type: string | null
  created_at: number
  last_used_at: number | null
  use_count: number
  workspace: string
  content_encrypted: Buffer | Uint8Array | null
  content_nonce: Buffer | Uint8Array | null
  preview_encrypted: Buffer | Uint8Array | null
  preview_nonce: Buffer | Uint8Array | null
  content_plaintext_legacy: number
  pinned_at: number | null
}

interface CountRow {
  count: number
}

interface IdImageRow {
  id: string
  image_path: string | null
}

let backfillRunning = false
const DEFAULT_WORKSPACE: WorkspaceContext = 'personal'

function vaultLockedError(): CodedError {
  const err = new Error('E_VAULT_LOCKED') as CodedError
  err.code = E_VAULT_LOCKED
  return err
}

function asBuffer(value: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value)
}

function decryptRowContent(row: ClipboardRow): { content: string | null; preview: string } {
  const hasCipher = Boolean(row.content_encrypted && row.content_nonce)
  const hasPreviewCipher = Boolean(row.preview_encrypted && row.preview_nonce)
  if (!hasCipher && !hasPreviewCipher && !row.content && !row.preview) {
    return { content: null, preview: '' }
  }
  if (row.content_plaintext_legacy === 0 && (hasCipher || hasPreviewCipher)) {
    if (!vault.isUnlocked()) {
      throw vaultLockedError()
    }
  }
  let content: string | null = null
  let preview = row.preview ?? ''
  if (hasCipher && vault.isUnlocked()) {
    try {
      content = vault.decryptBytesWithDEK(
        asBuffer(row.content_encrypted as Buffer | Uint8Array),
        asBuffer(row.content_nonce as Buffer | Uint8Array)
      )
    } catch {
      content = row.content ?? null
    }
  } else {
    content = row.content ?? null
  }
  if (hasPreviewCipher && vault.isUnlocked()) {
    try {
      preview = vault.decryptBytesWithDEK(
        asBuffer(row.preview_encrypted as Buffer | Uint8Array),
        asBuffer(row.preview_nonce as Buffer | Uint8Array)
      )
    } catch {
      preview = row.preview ?? ''
    }
  }
  return { content, preview }
}

function rowToClipboardItem(
  row: ClipboardRow,
  tags: string[],
  loadImage = false
): ClipboardItem {
  let imageData: string | undefined
  let imagePath: string | undefined
  if (row.type === 'image') {
    if (row.image_path) {
      imagePath = row.image_path
      if (loadImage) {
        imageData = imageStore.loadImageAsDataUrl(row.image_path) ?? undefined
      }
    } else if (loadImage && row.image_data) {
      imageData = row.image_data
    }
  }
  const { content, preview } = decryptRowContent(row)
  return {
    id: row.id,
    type: row.type as ClipboardItem['type'],
    content: content || undefined,
    imageData,
    imagePath,
    filePath: row.file_path || undefined,
    preview,
    hash: row.hash,
    size: row.size,
    sourceApp: row.source_app || undefined,
    isPinned: row.is_pinned === 1,
    isSnippet: row.is_snippet === 1,
    snippetName: row.snippet_name || undefined,
    snippetShortcut: row.snippet_shortcut || undefined,
    tags,
    detectedKeyType: row.detected_key_type || undefined,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || undefined,
    useCount: row.use_count
  }
}

function assertVaultUnlocked(): void {
  if (!vault.isUnlocked()) {
    throw vaultLockedError()
  }
}

function getClipboardTags(clipboardId: string): string[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT tag_name FROM clipboard_tags WHERE clipboard_id = ?')
    .all(clipboardId) as Array<{ tag_name: string }>
  return rows.map((r) => r.tag_name)
}

function generateHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex')
}

function generatePreview(content: string, maxLength = 100): string {
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}

export async function addClipboardItem(
  input: CreateClipboardItemInput,
  detectedKeyType: string | undefined = undefined,
  workspace: WorkspaceContext = DEFAULT_WORKSPACE
): Promise<ClipboardItem | null> {
  const db = getDatabase()
  const now = Date.now()
  const id = uuidv4()
  let content = ''
  let size = 0
  let imagePath: string | null = null
  if (input.type === 'text' || input.type === 'html') {
    content = input.content || ''
    size = Buffer.byteLength(content, 'utf8')
  } else if (input.type === 'image') {
    if (input.imageData) {
      imagePath = await imageStore.saveImageDataUrl(input.imageData)
      content = ''
      size = input.imageData.length
    }
  } else if (input.type === 'file') {
    content = input.filePath || ''
    size = content.length
  }
  const hashSource = input.type === 'image' ? input.imageData || imagePath || '' : content
  const hash = generateHash(hashSource)
  const existing = db
    .prepare('SELECT id FROM clipboard_history WHERE hash = ? AND is_snippet = 0')
    .get(hash) as { id: string } | undefined
  if (existing) {
    if (imagePath) imageStore.deleteImageFile(imagePath)
    db.prepare(
      `
      UPDATE clipboard_history
      SET created_at = ?, use_count = use_count + 1, last_used_at = ?
      WHERE id = ?
    `
    ).run(now, now, existing.id)
    return getClipboardItemById(existing.id)
  }
  const preview = generatePreview(
    input.type === 'image' ? '[图片]' : input.content || input.filePath || '[图片]'
  )
  assertVaultUnlocked()
  const plainContent = input.type === 'text' || input.type === 'html' ? content : ''
  const { cipher: contentCipher, nonce: contentNonce } = vault.encryptBytesWithDEK(plainContent)
  const { cipher: previewCipher, nonce: previewNonce } = vault.encryptBytesWithDEK(preview)
  db.prepare(
    `
    INSERT INTO clipboard_history
    (id, type, content, image_data, image_path, file_path, preview, hash, size, source_app,
     is_pinned, is_snippet, detected_key_type, created_at, use_count, workspace,
     content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?, ?, ?, 0)
  `
  ).run(
    id,
    input.type,
    null,
    null,
    imagePath,
    input.filePath || null,
    '',
    hash,
    size,
    input.sourceApp || null,
    detectedKeyType || null,
    now,
    workspace,
    contentCipher,
    contentNonce,
    previewCipher,
    previewNonce
  )
  cleanupOldHistory(resolveMaxHistorySize())
  return getClipboardItemById(id)
}

export function getClipboardItemById(id: string): ClipboardItem | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM clipboard_history WHERE id = ?').get(id) as
    | ClipboardRow
    | undefined
  if (!row) return null
  return rowToClipboardItem(row, getClipboardTags(id), true)
}

export function listClipboardHistory(
  filter: ClipboardFilter | undefined = undefined,
  limit = 100,
  offset = 0,
  workspace: WorkspaceContext = DEFAULT_WORKSPACE
): { items: ClipboardItem[]; total: number } {
  const db = getDatabase()
  let whereClause = 'workspace = ?'
  const params: Array<string | number> = [workspace]
  const memoryKeyword = filter?.keyword?.trim() || ''
  if (filter) {
    if (filter.type) {
      whereClause += ' AND type = ?'
      params.push(filter.type)
    }
    if (filter.pinnedOnly) {
      whereClause += ' AND is_pinned = 1'
    }
    if (filter.snippetsOnly) {
      whereClause += ' AND is_snippet = 1'
    }
    if (filter.detectedKeyType) {
      whereClause += ' AND detected_key_type = ?'
      params.push(filter.detectedKeyType)
    }
    if (filter.startTime) {
      whereClause += ' AND created_at >= ?'
      params.push(filter.startTime)
    }
    if (filter.endTime) {
      whereClause += ' AND created_at <= ?'
      params.push(filter.endTime)
    }
    if (filter.sourceApp) {
      whereClause += ' AND source_app = ?'
      params.push(filter.sourceApp)
    }
    if (filter.tags && filter.tags.length > 0) {
      const tagPlaceholders = filter.tags.map(() => '?').join(',')
      whereClause += ` AND id IN (SELECT clipboard_id FROM clipboard_tags WHERE tag_name IN (${tagPlaceholders}))`
      params.push(...filter.tags)
    }
  }
  if (!memoryKeyword) {
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM clipboard_history WHERE ${whereClause}`)
      .get(...params) as CountRow
    const total = countRow.count
    const rows = db
      .prepare(
        `
      SELECT * FROM clipboard_history
      WHERE ${whereClause}
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...params, limit, offset) as ClipboardRow[]
    return { items: rowsToItems(rows, false), total }
  }
  const allRows = db
    .prepare(
      `
      SELECT * FROM clipboard_history
      WHERE ${whereClause}
      ORDER BY is_pinned DESC, created_at DESC
    `
    )
    .all(...params) as ClipboardRow[]
  const allItems = rowsToItems(allRows, false)
  const kwLower = memoryKeyword.toLowerCase()
  const filtered = allItems.filter((it) => {
    const hay = `${it.content ?? ''}\n${it.preview ?? ''}\n${it.snippetName ?? ''}`
    return hay.toLowerCase().includes(kwLower)
  })
  return { items: filtered.slice(offset, offset + limit), total: filtered.length }
}

function rowsToItems(rows: ClipboardRow[], loadImage = false): ClipboardItem[] {
  if (rows.length === 0) return []
  const db = getDatabase()
  const idList = rows.map((r) => r.id)
  const tagsMap = new Map<string, string[]>()
  const placeholders = idList.map(() => '?').join(',')
  const tagRows = db
    .prepare(
      `SELECT clipboard_id, tag_name FROM clipboard_tags WHERE clipboard_id IN (${placeholders})`
    )
    .all(...idList) as Array<{ clipboard_id: string; tag_name: string }>
  for (const t of tagRows) {
    const arr = tagsMap.get(t.clipboard_id) ?? []
    arr.push(t.tag_name)
    tagsMap.set(t.clipboard_id, arr)
  }
  return rows.map((row) =>
    rowToClipboardItem(row, tagsMap.get(row.id) ?? [], loadImage)
  )
}

export function getClipboardImagePath(id: string): string | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT type, image_path FROM clipboard_history WHERE id = ?')
    .get(id) as { type: string; image_path: string | null } | undefined
  if (!row || row.type !== 'image' || !row.image_path) return null
  return row.image_path
}

export function deleteClipboardItem(id: string): boolean {
  const db = getDatabase()
  const row = db
    .prepare('SELECT image_path FROM clipboard_history WHERE id = ?')
    .get(id) as { image_path: string | null } | undefined
  if (row?.image_path) {
    imageStore.deleteImageFile(row.image_path)
  }
  const result = db.prepare('DELETE FROM clipboard_history WHERE id = ?').run(id)
  return result.changes > 0
}

export function deleteClipboardItems(ids: string[]): number {
  if (!Array.isArray(ids) || ids.length === 0) return 0
  let n = 0
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue
    if (deleteClipboardItem(id)) n++
  }
  return n
}

export function deleteClipboardOlderThan(cutoffMs: number, keepPinned = true): number {
  const db = getDatabase()
  const cutoff = typeof cutoffMs === 'number' && Number.isFinite(cutoffMs) ? cutoffMs : 0
  if (cutoff <= 0) return 0
  let sql = 'SELECT id, image_path FROM clipboard_history WHERE is_snippet = 0 AND created_at < ?'
  if (keepPinned) sql += ' AND is_pinned = 0'
  const rows = db.prepare(sql).all(cutoff) as IdImageRow[]
  if (!rows.length) return 0
  const ids = rows.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`DELETE FROM clipboard_history WHERE id IN (${placeholders})`).run(...ids)
  for (const r of rows) {
    if (r.image_path) imageStore.deleteImageFile(r.image_path)
  }
  return ids.length
}

export function setClipboardPinned(ids: string[], pinned: boolean): number {
  if (!Array.isArray(ids) || ids.length === 0) return 0
  const db = getDatabase()
  const val = pinned ? 1 : 0
  const now = pinned ? Date.now() : null
  let n = 0
  const stmt = db.prepare(
    'UPDATE clipboard_history SET is_pinned = ?, pinned_at = ? WHERE id = ? AND is_snippet = 0'
  )
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue
    const r = stmt.run(val, now, id)
    n += r.changes
  }
  return n
}

export function clearClipboardHistory(): number {
  const db = getDatabase()
  const rows = db
    .prepare(
      'SELECT image_path FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0 AND image_path IS NOT NULL'
    )
    .all() as Array<{ image_path: string | null }>
  for (const r of rows) {
    imageStore.deleteImageFile(r.image_path)
  }
  const result = db
    .prepare('DELETE FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0')
    .run()
  return result.changes
}

export function toggleClipboardPin(id: string): boolean {
  const db = getDatabase()
  const row = db
    .prepare('SELECT is_pinned FROM clipboard_history WHERE id = ?')
    .get(id) as { is_pinned: number } | undefined
  if (!row) return false
  const newValue = row.is_pinned === 1 ? 0 : 1
  db.prepare('UPDATE clipboard_history SET is_pinned = ?, pinned_at = ? WHERE id = ?').run(
    newValue,
    newValue === 1 ? Date.now() : null,
    id
  )
  return newValue === 1
}

export function recordClipboardUsage(id: string): void {
  const db = getDatabase()
  const now = Date.now()
  db.prepare(
    `
    UPDATE clipboard_history
    SET use_count = use_count + 1, last_used_at = ?
    WHERE id = ?
  `
  ).run(now, id)
}

export function createSnippet(
  input: CreateSnippetInput,
  workspace: WorkspaceContext = DEFAULT_WORKSPACE
): ClipboardItem {
  return transaction(() => {
    const db = getDatabase()
    const now = Date.now()
    const id = uuidv4()
    const hash = generateHash(input.content)
    const preview = generatePreview(input.content)
    const size = Buffer.byteLength(input.content, 'utf8')
    assertVaultUnlocked()
    const { cipher: contentCipher, nonce: contentNonce } = vault.encryptBytesWithDEK(
      input.content
    )
    const { cipher: previewCipher, nonce: previewNonce } = vault.encryptBytesWithDEK(preview)
    db.prepare(
      `
      INSERT INTO clipboard_history
      (id, type, content, preview, hash, size, is_pinned, is_snippet, snippet_name, snippet_shortcut, created_at, use_count, workspace,
       content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy)
      VALUES (?, 'text', ?, ?, ?, ?, 0, 1, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)
    `
    ).run(
      id,
      null,
      '',
      hash,
      size,
      input.name,
      input.shortcut || null,
      now,
      workspace,
      contentCipher,
      contentNonce,
      previewCipher,
      previewNonce
    )
    if (input.tags && input.tags.length > 0) {
      const insertTag = db.prepare(
        'INSERT INTO clipboard_tags (clipboard_id, tag_name) VALUES (?, ?)'
      )
      for (const tag of input.tags) {
        insertTag.run(id, tag)
      }
    }
    const created = getClipboardItemById(id)
    if (!created) throw new Error('createSnippet: row missing after insert')
    return created
  })
}

export function updateSnippet(input: UpdateSnippetInput): ClipboardItem | null {
  return transaction(() => {
    const db = getDatabase()
    const existing = getClipboardItemById(input.id)
    if (!existing || !existing.isSnippet) {
      return null
    }
    const updates: string[] = []
    const values: Array<string | number | Buffer | null> = []
    if (input.content !== undefined) {
      assertVaultUnlocked()
      const previewText = generatePreview(input.content)
      const { cipher: cc, nonce: cn } = vault.encryptBytesWithDEK(input.content)
      const { cipher: pc, nonce: pn } = vault.encryptBytesWithDEK(previewText)
      updates.push(
        'content = ?',
        'preview = ?',
        'hash = ?',
        'size = ?',
        'content_encrypted = ?',
        'content_nonce = ?',
        'preview_encrypted = ?',
        'preview_nonce = ?',
        'content_plaintext_legacy = 0'
      )
      values.push(
        null,
        '',
        generateHash(input.content),
        Buffer.byteLength(input.content, 'utf8'),
        cc,
        cn,
        pc,
        pn
      )
    }
    if (input.name !== undefined) {
      updates.push('snippet_name = ?')
      values.push(input.name)
    }
    if (input.shortcut !== undefined) {
      updates.push('snippet_shortcut = ?')
      values.push(input.shortcut || null)
    }
    if (input.isPinned !== undefined) {
      updates.push('is_pinned = ?')
      values.push(input.isPinned ? 1 : 0)
    }
    if (updates.length > 0) {
      values.push(input.id)
      db.prepare(`UPDATE clipboard_history SET ${updates.join(', ')} WHERE id = ?`).run(
        ...values
      )
    }
    if (input.tags !== undefined) {
      db.prepare('DELETE FROM clipboard_tags WHERE clipboard_id = ?').run(input.id)
      if (input.tags.length > 0) {
        const insertTag = db.prepare(
          'INSERT INTO clipboard_tags (clipboard_id, tag_name) VALUES (?, ?)'
        )
        for (const tag of input.tags) {
          insertTag.run(input.id, tag)
        }
      }
    }
    return getClipboardItemById(input.id)
  })
}

export function getSnippets(workspace: WorkspaceContext = DEFAULT_WORKSPACE): ClipboardItem[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `
    SELECT * FROM clipboard_history
    WHERE is_snippet = 1 AND workspace = ?
    ORDER BY snippet_name ASC
  `
    )
    .all(workspace) as ClipboardRow[]
  const idList = rows.map((r) => r.id)
  const tagsMap = new Map<string, string[]>()
  if (idList.length > 0) {
    const placeholders = idList.map(() => '?').join(',')
    const tagRows = db
      .prepare(
        `SELECT clipboard_id, tag_name FROM clipboard_tags WHERE clipboard_id IN (${placeholders})`
      )
      .all(...idList) as Array<{ clipboard_id: string; tag_name: string }>
    for (const t of tagRows) {
      const arr = tagsMap.get(t.clipboard_id) ?? []
      arr.push(t.tag_name)
      tagsMap.set(t.clipboard_id, arr)
    }
  }
  return rows.map((row) => rowToClipboardItem(row, tagsMap.get(row.id) ?? [], false))
}

const MAX_HISTORY_DEFAULT = 500
const MAX_PINNED = 200
const IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const NON_IMAGE_TTL_MS = 90 * 24 * 60 * 60 * 1000

function resolveMaxHistorySize(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPrefs } = require('../main/prefs') as {
      getPrefs: () => { maxHistorySize?: number }
    }
    const n = getPrefs()?.maxHistorySize
    if (typeof n === 'number' && n >= 50 && n <= 5000) return Math.floor(n)
  } catch {
    /* prefs 未就绪时走默认 */
  }
  return MAX_HISTORY_DEFAULT
}

function cleanupOldHistory(maxSize = MAX_HISTORY_DEFAULT): void {
  const db = getDatabase()
  const nonPinnedCount = db
    .prepare(
      'SELECT COUNT(*) as count FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0'
    )
    .get() as CountRow
  if (nonPinnedCount.count > maxSize) {
    const deleteCount = nonPinnedCount.count - maxSize
    const rows = db
      .prepare(
        `
        SELECT id, image_path FROM clipboard_history
        WHERE is_pinned = 0 AND is_snippet = 0
        ORDER BY created_at ASC
        LIMIT ?
      `
      )
      .all(deleteCount) as IdImageRow[]
    const ids = rows.map((r) => r.id)
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      db.prepare(`DELETE FROM clipboard_history WHERE id IN (${placeholders})`).run(...ids)
      for (const r of rows) {
        if (r.image_path) imageStore.deleteImageFile(r.image_path)
      }
    }
  }
  const pinnedCount = db
    .prepare(
      'SELECT COUNT(*) as count FROM clipboard_history WHERE is_pinned = 1 AND is_snippet = 0'
    )
    .get() as CountRow
  if (pinnedCount.count > MAX_PINNED) {
    const extra = pinnedCount.count - MAX_PINNED
    const rows = db
      .prepare(
        `
        SELECT id, image_path FROM clipboard_history
        WHERE is_pinned = 1 AND is_snippet = 0
        ORDER BY COALESCE(pinned_at, 0) ASC
        LIMIT ?
      `
      )
      .all(extra) as IdImageRow[]
    const ids = rows.map((r) => r.id)
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      db.prepare(`DELETE FROM clipboard_history WHERE id IN (${placeholders})`).run(...ids)
      for (const r of rows) {
        if (r.image_path) imageStore.deleteImageFile(r.image_path)
      }
    }
  }
  const imageTtlCutoff = Date.now() - IMAGE_TTL_MS
  const oldImages = db
    .prepare(
      `
      SELECT id, image_path FROM clipboard_history
      WHERE type = 'image' AND is_pinned = 0 AND is_snippet = 0 AND created_at < ?
    `
    )
    .all(imageTtlCutoff) as IdImageRow[]
  if (oldImages.length > 0) {
    const ids = oldImages.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`DELETE FROM clipboard_history WHERE id IN (${placeholders})`).run(...ids)
    for (const r of oldImages) {
      if (r.image_path) imageStore.deleteImageFile(r.image_path)
    }
  }
  void NON_IMAGE_TTL_MS
}

export async function backfillClipboardEncryption(
  onProgress?: (payload: { done: number; total: number }) => void
): Promise<{ scanned: number; migrated: number; skipped: number }> {
  if (backfillRunning) {
    return { scanned: 0, migrated: 0, skipped: 0 }
  }
  if (!vault.isUnlocked()) {
    return { scanned: 0, migrated: 0, skipped: 0 }
  }
  backfillRunning = true
  try {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, content, preview FROM clipboard_history
         WHERE content_plaintext_legacy = 1`
      )
      .all() as Array<{ id: string; content: string | null; preview: string | null }>
    let migrated = 0
    let skipped = 0
    const update = db.prepare(`UPDATE clipboard_history
       SET content_encrypted = ?, content_nonce = ?,
           preview_encrypted = ?, preview_nonce = ?,
           content = NULL, preview = '',
           content_plaintext_legacy = 0
       WHERE id = ? AND content_plaintext_legacy = 1`)
    const total = rows.length
    if (onProgress) {
      try {
        onProgress({ done: 0, total })
      } catch {
        /* ignore listener error */
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      try {
        const plainContent = row.content ?? ''
        const plainPreview = row.preview ?? ''
        const { cipher: cc, nonce: cn } = vault.encryptBytesWithDEK(plainContent)
        const { cipher: pc, nonce: pn } = vault.encryptBytesWithDEK(plainPreview)
        update.run(cc, cn, pc, pn, row.id)
        migrated += 1
      } catch {
        skipped += 1
      }
      const done = i + 1
      if (onProgress && (done % 50 === 0 || done === total)) {
        try {
          onProgress({ done, total })
        } catch {
          /* ignore listener error */
        }
      }
    }
    return { scanned: total, migrated, skipped }
  } finally {
    backfillRunning = false
  }
}

export function findByHash(hash: string): ClipboardItem | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM clipboard_history WHERE hash = ? LIMIT 1')
    .get(hash) as ClipboardRow | undefined
  if (!row) return null
  return rowToClipboardItem(row, getClipboardTags(row.id), false)
}
