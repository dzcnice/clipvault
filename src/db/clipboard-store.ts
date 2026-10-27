/**
 * 剪贴板数据存储层 · v3.1 personal
 * workspace 固定 personal；content 加密 + legacy backfill
 */

import { v4 as uuidv4 } from 'uuid'
import * as crypto from 'crypto'
import { getDatabase, transaction } from './connection'
import * as imageStore from '../main/storage/image-store'
import * as vault from '../main/crypto/vault'
import { getPrefs } from '../main/prefs'
import { fuzzyMatch } from '../utils/fuzzy-search'
import { classifyClip, matchProject } from '../main/clipboard/classify'
import { listProjects } from './workbench-store'
import type {
  ClipboardFilter,
  ClipboardItem,
  ClipboardOccurrence,
  CreateClipboardItemInput,
  CreateSnippetInput,
  UpdateSnippetInput,
  WorkspaceContext
} from '../types'

export const E_VAULT_LOCKED = 'E_VAULT_LOCKED'

export function clipboardGroups(): { categories: Record<string, number>; projects: Record<string, number>; total: number; pinned: number; saved: number } {
  if (!vault.isUnlocked()) throw new Error(E_VAULT_LOCKED)
  const db = getDatabase()
  const rows = db.prepare('SELECT category, project_id, is_pinned, is_saved, COUNT(*) AS n FROM clipboard_history WHERE is_snippet = 0 GROUP BY category, project_id, is_pinned, is_saved').all() as Array<{ category: string; project_id: string; is_pinned: number; is_saved: number; n: number }>
  const result = { categories: {} as Record<string, number>, projects: {} as Record<string, number>, total: 0, pinned: 0, saved: 0 }
  for (const row of rows) {
    if (row.is_saved) { result.saved += row.n; continue }
    result.total += row.n; if (row.is_pinned) result.pinned += row.n
    const category = row.category || 'text'; result.categories[category] = (result.categories[category] || 0) + row.n
    if (row.project_id) result.projects[row.project_id] = (result.projects[row.project_id] || 0) + row.n
  }
  return result
}

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
  last_copied_at: number | null
  copy_count: number
  first_seen_known: number
  is_saved: number
  saved_at: number | null
  saved_from_id: string | null
  category: ClipboardItem['category'] | null
  project_id: string | null
  ai_meta: string | null
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

function decryptRowContent(row: ClipboardRow): { content: string | null; preview: string; decryptError?: boolean } {
  if (Boolean(row.content_encrypted) !== Boolean(row.content_nonce) || Boolean(row.preview_encrypted) !== Boolean(row.preview_nonce)) {
    return { content: null, preview: '此条历史加密数据不完整，原记录已保留', decryptError: true }
  }
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
      return { content: null, preview: '此条历史无法解密，原记录已保留', decryptError: true }
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
      return { content: null, preview: '此条历史无法解密，原记录已保留', decryptError: true }
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
  const { content, preview, decryptError } = decryptRowContent(row)
  let aiMeta: ClipboardItem['aiMeta']
  if (row.ai_meta) try { aiMeta = JSON.parse(vault.decryptWithDEK(row.ai_meta)) as ClipboardItem['aiMeta'] } catch { /* Preserve corrupt optional metadata and original content. */ }
  return {
    id: row.id,
    type: row.type as ClipboardItem['type'],
    content: content || undefined,
    category: row.category ?? classifyClip({ type: row.type, text: content ?? row.file_path ?? '' }).category,
    projectId: row.project_id,
    aiMeta,
    ...(decryptError ? { decryptError: true } : {}),
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
    lastCopiedAt: row.last_copied_at ?? row.created_at,
    copyCount: row.copy_count,
    firstSeenKnown: row.first_seen_known === 1,
    isSaved: row.is_saved === 1,
    savedAt: row.saved_at ?? undefined,
    savedFromId: row.saved_from_id ?? undefined,
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
  assertVaultUnlocked()
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
      content = ''
      size = Buffer.byteLength(input.imageData.split(',')[1] ?? '', 'base64')
    }
  } else if (input.type === 'file') {
    content = input.filePath || ''
    size = Buffer.byteLength(content, 'utf8')
  }
  const hashSource = input.type === 'image' ? input.imageData || imagePath || '' : content
  const hash = generateHash(hashSource)
  const category = classifyClip({ type: input.type, text: content, sourceApp: input.sourceApp }).category
  const projectId = matchProject(content, listProjects())
  const findExisting = (): { id: string } | undefined => db
    .prepare('SELECT id FROM clipboard_history WHERE hash = ? AND type = ? AND workspace = ? AND is_snippet = 0 AND is_saved = 0')
    .get(hash, input.type, workspace) as { id: string } | undefined
  const recordCapture = (clipboardId: string): void => {
    db.prepare(`UPDATE clipboard_history
      SET source_app = CASE WHEN ? >= COALESCE(last_copied_at, created_at) THEN ? ELSE source_app END,
          last_copied_at = MAX(COALESCE(last_copied_at, created_at), ?),
          created_at = CASE WHEN first_seen_known = 1 THEN MIN(created_at, ?) ELSE created_at END,
          copy_count = copy_count + 1, category = ?, project_id = COALESCE(?, project_id)
      WHERE id = ?`).run(now, input.sourceApp ?? null, now, now, category, projectId, clipboardId)
    db.prepare('INSERT INTO clipboard_occurrences (clipboard_id, copied_at, source_app) VALUES (?, ?, ?)')
      .run(clipboardId, now, input.sourceApp ?? null)
  }
  const existing = findExisting()
  if (existing) {
    transaction(() => recordCapture(existing.id))
    cleanupOldHistory(resolveMaxHistorySize())
    return getClipboardItemById(existing.id)
  }
  if (input.type === 'image') {
    if (!input.imageData) throw new Error('图片数据不可用')
    imagePath = await imageStore.saveImageDataUrl(input.imageData)
    if (!imagePath) throw new Error('保存图片失败')
  }
  const preview = generatePreview(
    input.type === 'image' ? '[图片]' : input.content || input.filePath || '[图片]'
  )
  const plainContent = input.type === 'text' || input.type === 'html' ? content : ''
  let resultId = id
  try {
    const { cipher: contentCipher, nonce: contentNonce } = vault.encryptBytesWithDEK(plainContent)
    const { cipher: previewCipher, nonce: previewNonce } = vault.encryptBytesWithDEK(preview)
    transaction(() => {
      assertVaultUnlocked()
      const concurrent = findExisting()
      if (concurrent) {
        recordCapture(concurrent.id)
        resultId = concurrent.id
        return
      }
      db.prepare(`
        INSERT INTO clipboard_history
        (id, type, content, image_data, image_path, file_path, preview, hash, size, source_app,
         is_pinned, is_snippet, detected_key_type, created_at, use_count, workspace,
         content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy,
         last_copied_at, first_seen_known, category, project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)
      `).run(
        id, input.type, null, null, imagePath, input.filePath || null, '', hash, size,
        input.sourceApp || null, detectedKeyType || null, now, workspace,
        contentCipher, contentNonce, previewCipher, previewNonce, now, category, projectId
      )
      db.prepare('INSERT INTO clipboard_occurrences (clipboard_id, copied_at, source_app) VALUES (?, ?, ?)')
        .run(id, now, input.sourceApp ?? null)
    })
  } catch (error) {
    if (imagePath) imageStore.deleteImageFile(imagePath)
    throw error
  }
  if (resultId !== id && imagePath) imageStore.deleteImageFile(imagePath)
  cleanupOldHistory(resolveMaxHistorySize())
  return getClipboardItemById(resultId)
}

export function getClipboardItemById(id: string, loadImage = true): ClipboardItem | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM clipboard_history WHERE id = ?').get(id) as
    | ClipboardRow
    | undefined
  if (!row) return null
  return rowToClipboardItem(row, getClipboardTags(id), loadImage)
}

function historyQuery(
  filter: ClipboardFilter | undefined = undefined,
  workspace: WorkspaceContext = DEFAULT_WORKSPACE
): { whereClause: string; params: Array<string | number>; keyword: string } {
  let whereClause = 'workspace = ?'
  const params: Array<string | number> = [workspace]
  const memoryKeyword = filter?.keyword?.trim() || ''
  if (filter) {
    if (Array.isArray(filter.categories) && filter.categories.length) { const values = filter.categories.slice(0, 9); whereClause += ` AND category IN (${values.map(() => '?').join(',')})`; params.push(...values) }
    if (Array.isArray(filter.sourceApps) && filter.sourceApps.length) { const values = filter.sourceApps.slice(0, 20); whereClause += ` AND (source_app IN (${values.map(() => '?').join(',')}) OR id IN (SELECT clipboard_id FROM clipboard_occurrences WHERE source_app IN (${values.map(() => '?').join(',')})))`; params.push(...values, ...values) }
    if (filter.category) { whereClause += ' AND category = ?'; params.push(filter.category) }
    if (filter.projectId) { whereClause += ' AND project_id = ?'; params.push(filter.projectId) }
    if (filter.type) {
      whereClause += ' AND type = ?'
      params.push(filter.type)
    }
    if (filter.pinnedOnly) {
      whereClause += ' AND is_pinned = 1'
    }
    if (typeof filter.savedOnly === 'boolean') {
      whereClause += ' AND is_saved = ?'
      params.push(filter.savedOnly ? 1 : 0)
    }
    if (filter.snippetsOnly) {
      whereClause += ' AND is_snippet = 1'
    }
    if (filter.detectedKeyType) {
      whereClause += ' AND detected_key_type = ?'
      params.push(filter.detectedKeyType)
    }
    if (filter.startTime) {
      whereClause += ' AND COALESCE(last_copied_at, created_at) >= ?'
      params.push(filter.startTime)
    }
    if (filter.endTime) {
      whereClause += ' AND COALESCE(last_copied_at, created_at) <= ?'
      params.push(filter.endTime)
    }
    if (filter.sourceApp) {
      whereClause += ' AND (source_app = ? OR id IN (SELECT clipboard_id FROM clipboard_occurrences WHERE source_app = ?))'
      params.push(filter.sourceApp, filter.sourceApp)
    }
    if (filter.tags && filter.tags.length > 0) {
      const tagPlaceholders = filter.tags.map(() => '?').join(',')
      whereClause += ` AND id IN (SELECT clipboard_id FROM clipboard_tags WHERE tag_name IN (${tagPlaceholders}))`
      params.push(...filter.tags)
    }
  }
  return { whereClause, params, keyword: memoryKeyword.toLowerCase() }
}

const HISTORY_ORDER = 'is_pinned DESC, COALESCE(last_copied_at, created_at) DESC, id ASC'

function matchesKeyword(item: ClipboardItem, keyword: string, fuzzyPreview = false): boolean {
  if ([item.content, item.preview, item.aiMeta?.title, item.aiMeta?.summary, item.snippetName, item.filePath, item.sourceApp, ...item.tags]
    .filter(Boolean).join('\n').toLowerCase().includes(keyword)) return true
  return fuzzyPreview && Boolean(fuzzyMatch(keyword, item.snippetName || item.preview.slice(0, 80)))
}

function pageSize(value: number, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(Math.floor(value), maximum)) : fallback
}

export function listClipboardHistory(
  filter?: ClipboardFilter,
  limit = 100,
  offset = 0,
  workspace: WorkspaceContext = DEFAULT_WORKSPACE
): { items: ClipboardItem[]; total: number } {
  const db = getDatabase()
  const { whereClause, params, keyword: memoryKeyword } = historyQuery(filter, workspace)
  limit = pageSize(limit, 100, 5000)
  offset = pageSize(offset, 0, Number.MAX_SAFE_INTEGER)
  if (!memoryKeyword && !filter?.keywords?.length) {
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM clipboard_history WHERE ${whereClause}`)
      .get(...params) as CountRow
    const total = countRow.count
    const rows = db
      .prepare(
        `
      SELECT * FROM clipboard_history
      WHERE ${whereClause}
      ORDER BY ${HISTORY_ORDER}
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
      ORDER BY ${HISTORY_ORDER}
    `
    )
    .all(...params) as ClipboardRow[]
  const allItems = rowsToItems(allRows, false)
  const filtered = allItems.filter((it) => matchesKeyword(it, memoryKeyword, filter?.fuzzyPreview) && (filter?.keywords ?? []).slice(0, 10).every(word => matchesKeyword(it, word.toLowerCase(), filter?.fuzzyPreview)))
  return { items: filtered.slice(offset, offset + limit), total: filtered.length }
}

/** 全库关键词查询分批解密，并在批次间让出主进程；不写明文索引。 */
export async function searchClipboardHistory(
  filter?: ClipboardFilter,
  limit = 100,
  offset = 0,
  signal?: AbortSignal
): Promise<{ items: ClipboardItem[]; total: number }> {
  assertVaultUnlocked()
  if (!filter?.keyword?.trim() && !filter?.keywords?.length) return listClipboardHistory(filter, limit, offset)
  const db = getDatabase()
  const { whereClause, params, keyword } = historyQuery(filter)
  limit = pageSize(limit, 100, 5000)
  offset = pageSize(offset, 0, 100000)
  const end = limit + offset
  const ceiling = (db.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM clipboard_history').get() as { n: number }).n
  let cursor = 0
  let total = 0
  let found: ClipboardItem[] = []
  const compare = (a: ClipboardItem, b: ClipboardItem): number =>
    Number(b.isPinned) - Number(a.isPinned) || (b.lastCopiedAt ?? b.createdAt) - (a.lastCopiedAt ?? a.createdAt) || a.id.localeCompare(b.id)
  while (cursor < ceiling) {
    if (signal?.aborted) throw new Error('查询已取消')
    assertVaultUnlocked()
    const rows = db.prepare(`SELECT rowid AS cursor, * FROM clipboard_history
      WHERE rowid > ? AND rowid <= ? AND ${whereClause} ORDER BY rowid LIMIT 64`)
      .all(cursor, ceiling, ...params) as Array<ClipboardRow & { cursor: number }>
    if (!rows.length) break
    cursor = rows[rows.length - 1]!.cursor
    const matches = rowsToItems(rows).filter(item => matchesKeyword(item, keyword, filter?.fuzzyPreview) && (filter?.keywords ?? []).slice(0, 10).every(word => matchesKeyword(item, word.toLowerCase(), filter?.fuzzyPreview)))
    total += matches.length
    found.push(...matches)
    if (found.length > end) found = found.sort(compare).slice(0, end)
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  if (signal?.aborted) throw new Error('查询已取消')
  assertVaultUnlocked()
  return { items: found.sort(compare).slice(offset, end), total }
}

export function getClipboardOccurrences(id: string, limit = 50): ClipboardOccurrence[] {
  const rows = getDatabase().prepare(`SELECT * FROM clipboard_occurrences
    WHERE clipboard_id = ? ORDER BY copied_at DESC, id DESC LIMIT ?`).all(id, pageSize(limit, 50, 200)) as
    Array<{ id: number; clipboard_id: string; copied_at: number; source_app: string | null; is_migration: number }>
  return rows.map(row => ({ id: row.id, clipboardId: row.clipboard_id, copiedAt: row.copied_at,
    sourceApp: row.source_app ?? undefined, isMigration: row.is_migration === 1 }))
}

/** 长期保存为独立行和独立图片，删除原历史不会带走快照。 */
export function saveClipboardSnapshot(id: string): ClipboardItem {
  assertVaultUnlocked()
  const db = getDatabase()
  const source = db.prepare('SELECT * FROM clipboard_history WHERE id = ?').get(id) as ClipboardRow | undefined
  if (!source) throw new Error('记录不存在')
  if (source.is_saved || source.is_snippet) return getClipboardItemById(id)!
  const previous = db.prepare('SELECT id FROM clipboard_history WHERE saved_from_id = ? AND is_saved = 1').get(id) as { id: string } | undefined
  if (previous) return getClipboardItemById(previous.id)!
  const savedId = uuidv4()
  const imagePath = source.image_path ? imageStore.copyImageFile(source.image_path) : null
  try {
    transaction(() => {
      db.prepare(`INSERT INTO clipboard_history
        (id, type, content, image_data, image_path, file_path, preview, hash, size, source_app,
        is_pinned, is_snippet, detected_key_type, created_at, last_copied_at, copy_count, first_seen_known,
        workspace, content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy,
        is_saved, saved_at, saved_from_id, category, project_id, ai_meta)
        SELECT ?, type, content, image_data, ?, file_path, preview, hash, size, source_app,
        0, 0, detected_key_type, created_at, last_copied_at, copy_count, first_seen_known,
        workspace, content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy,
        1, ?, id, category, project_id, ai_meta FROM clipboard_history WHERE id = ?`).run(savedId, imagePath, Date.now(), id)
      db.prepare('INSERT INTO clipboard_tags (clipboard_id, tag_name) SELECT ?, tag_name FROM clipboard_tags WHERE clipboard_id = ?').run(savedId, id)
      db.prepare(`INSERT INTO clipboard_occurrences (clipboard_id, copied_at, source_app, is_migration)
        SELECT ?, copied_at, source_app, is_migration FROM clipboard_occurrences WHERE clipboard_id = ?`).run(savedId, id)
    })
  } catch (error) {
    if (imagePath) imageStore.deleteImageFile(imagePath)
    throw error
  }
  return getClipboardItemById(savedId)!
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
  const result = db.prepare('DELETE FROM clipboard_history WHERE id = ?').run(id)
  if (result.changes > 0 && row?.image_path) {
    const reference = db.prepare('SELECT id FROM clipboard_history WHERE image_path = ? LIMIT 1').get(row.image_path)
    if (!reference) imageStore.deleteImageFile(row.image_path)
  }
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
  let sql = 'SELECT id, image_path FROM clipboard_history WHERE is_snippet = 0 AND is_saved = 0 AND COALESCE(last_copied_at, created_at) < ?'
  if (keepPinned) sql += ' AND is_pinned = 0'
  const rows = db.prepare(sql).all(cutoff) as IdImageRow[]
  if (!rows.length) return 0
  return deleteClipboardItems(rows.map(row => row.id))
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
      'SELECT id FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0 AND is_saved = 0'
    )
    .all() as Array<{ id: string }>
  return deleteClipboardItems(rows.map(row => row.id))
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

function resolveMaxHistorySize(): number {
  return getPrefs().maxHistorySize ?? MAX_HISTORY_DEFAULT
}

/** 自动清理仅作用于临时、未置顶历史；长期副本独立保留。 */
export function cleanupOldHistory(maxSize = resolveMaxHistorySize()): number {
  const prefs = getPrefs()
  const db = getDatabase()
  const rows = db.prepare(`SELECT id, type, size, COALESCE(last_copied_at, created_at) AS copied_at
    FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0 AND is_saved = 0
    AND NOT EXISTS (SELECT 1 FROM wb_session_clipboard_refs r WHERE r.clipboard_id=clipboard_history.id)
    ORDER BY COALESCE(last_copied_at, created_at) DESC, id ASC`).all() as
    Array<{ id: string; type: string; size: number; copied_at: number }>
  const now = Date.now()
  const day = 86400000
  const maxBytes = (prefs.historyMaxSizeMb ?? 0) * 1024 * 1024
  let retained = 0
  let bytes = 0
  const remove: string[] = []
  for (const row of rows) {
    const expired = (prefs.historyRetentionDays > 0 && row.copied_at < now - prefs.historyRetentionDays * day)
      || (row.type === 'image' && prefs.imageRetentionDays > 0 && row.copied_at < now - prefs.imageRetentionDays * day)
    const exceeds = retained >= maxSize || (maxBytes > 0 && bytes + row.size > maxBytes)
    if (expired || exceeds) {
      remove.push(row.id)
    } else {
      retained++
      bytes += row.size
    }
  }
  return deleteClipboardItems(remove)
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
