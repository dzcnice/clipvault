/**
 * 凭证数据存储层 · v3.1 personal
 * workspace 固定 personal；DEK 加密 value
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase, transaction } from './connection'
import { CredentialSortBy, SortDirection } from '../types'
import type {
  CreateCredentialInput,
  Credential,
  CredentialFilter,
  CredentialMetadata,
  Tag,
  UpdateCredentialInput,
  WorkspaceContext
} from '../types'
import * as vault from '../main/crypto/vault'
import { logger } from '../main/utils/logger'

const DEFAULT_WORKSPACE: WorkspaceContext = 'personal'

interface CredentialRow {
  id: string
  name: string
  type: string
  value: string
  description: string | null
  category_id: string | null
  metadata: string | null
  created_at: number
  updated_at: number
  last_used_at: number | null
  use_count: number
  is_favorite: number
  value_encrypted: number
  workspace: string
}

function parseMetadata(raw: string | null): CredentialMetadata {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as CredentialMetadata
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    logger.warn('[credential-store] metadata JSON 损坏，已回退为空对象:', err)
    return {}
  }
}

function rowToCredential(
  row: CredentialRow,
  tags: string[],
  includeSecrets = true
): Credential {
  let value = ''
  let decryptError = false
  let decryptErrorMessage: string | undefined
  if (includeSecrets) {
    if (row.value_encrypted === 1) {
      try {
        value = vault.decryptWithDEK(row.value)
      } catch (err) {
        logger.error('[credential-store] 解密失败，标记 decryptError:', err)
        value = ''
        decryptError = true
        decryptErrorMessage = err instanceof Error ? err.message : String(err)
      }
    } else {
      value = row.value
    }
  }
  const base: Credential = {
    id: row.id,
    name: row.name,
    type: row.type as Credential['type'],
    value,
    description: row.description || undefined,
    categoryId: row.category_id || undefined,
    tags,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at || undefined,
    useCount: row.use_count,
    isFavorite: row.is_favorite === 1
  }
  if (decryptError) {
    base.decryptError = true
    base.decryptErrorMessage = decryptErrorMessage
  }
  return base
}

function getCredentialTags(credentialId: string): string[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT tag_name FROM credential_tags WHERE credential_id = ?')
    .all(credentialId) as Array<{ tag_name: string }>
  return rows.map((r) => r.tag_name)
}

function setCredentialTags(credentialId: string, tags: string[]): void {
  const db = getDatabase()
  db.prepare('DELETE FROM credential_tags WHERE credential_id = ?').run(credentialId)
  if (tags.length > 0) {
    const insertTag = db.prepare(
      'INSERT INTO credential_tags (credential_id, tag_name) VALUES (?, ?)'
    )
    const updateTagCount = db.prepare(`
      INSERT INTO tags (name, use_count) VALUES (?, 1)
      ON CONFLICT(name) DO UPDATE SET use_count = use_count + 1
    `)
    for (const tag of tags) {
      insertTag.run(credentialId, tag)
      updateTagCount.run(tag)
    }
  }
}

export function createCredential(
  input: CreateCredentialInput,
  workspace: WorkspaceContext = DEFAULT_WORKSPACE
): Credential {
  if (!vault.isUnlocked()) {
    throw new Error('E_VAULT_LOCKED: cannot create credential while vault is locked')
  }
  return transaction(() => {
    const db = getDatabase()
    const now = Date.now()
    const id = uuidv4()
    const storedValue = vault.encryptWithDEK(input.value)
    const isEncrypted = 1
    db.prepare(
      `
      INSERT INTO credentials (id, name, type, value, description, category_id, metadata, created_at, updated_at, use_count, is_favorite, value_encrypted, workspace)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `
    ).run(
      id,
      input.name,
      input.type,
      storedValue,
      input.description || null,
      input.categoryId || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now,
      isEncrypted,
      workspace
    )
    if (input.tags && input.tags.length > 0) {
      setCredentialTags(id, input.tags)
    }
    const created = getCredentialById(id)
    if (!created) throw new Error('createCredential: row missing after insert')
    return created
  })
}

export function getCredentialById(id: string): Credential | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as
    | CredentialRow
    | undefined
  if (!row) return null
  return rowToCredential(row, getCredentialTags(id))
}

export function updateCredential(input: UpdateCredentialInput): Credential | null {
  if (input.value !== undefined && !vault.isUnlocked()) {
    throw new Error('E_VAULT_LOCKED: cannot update credential value while vault is locked')
  }
  return transaction(() => {
    const db = getDatabase()
    const existing = getCredentialById(input.id)
    if (!existing) {
      return null
    }
    const now = Date.now()
    const updates = ['updated_at = ?']
    const values: Array<string | number | null> = [now]
    if (input.name !== undefined) {
      updates.push('name = ?')
      values.push(input.name)
    }
    if (input.type !== undefined) {
      updates.push('type = ?')
      values.push(input.type)
    }
    if (input.value !== undefined) {
      const storedValue = vault.encryptWithDEK(input.value)
      updates.push('value = ?', 'value_encrypted = ?')
      values.push(storedValue, 1)
    }
    if (input.description !== undefined) {
      updates.push('description = ?')
      values.push(input.description || null)
    }
    if (input.categoryId !== undefined) {
      updates.push('category_id = ?')
      values.push(input.categoryId || null)
    }
    if (input.metadata !== undefined) {
      const mergedMetadata = { ...existing.metadata, ...input.metadata }
      updates.push('metadata = ?')
      values.push(JSON.stringify(mergedMetadata))
    }
    if (input.isFavorite !== undefined) {
      updates.push('is_favorite = ?')
      values.push(input.isFavorite ? 1 : 0)
    }
    values.push(input.id)
    db.prepare(`UPDATE credentials SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    if (input.tags !== undefined) {
      setCredentialTags(input.id, input.tags)
    }
    return getCredentialById(input.id)
  })
}

export function deleteCredential(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM credentials WHERE id = ?').run(id)
  return result.changes > 0
}

export function listCredentials(
  filter: CredentialFilter | undefined = undefined,
  sortBy: CredentialSortBy = CredentialSortBy.UPDATED_AT,
  sortDir: SortDirection = SortDirection.DESC,
  limit: number | undefined = undefined,
  offset: number | undefined = undefined,
  workspace: WorkspaceContext = DEFAULT_WORKSPACE,
  includeSecrets = false
): { items: Credential[]; total: number } {
  const db = getDatabase()
  let whereClause = 'workspace = ?'
  const params: Array<string | number> = [workspace]
  if (filter) {
    if (filter.keyword) {
      whereClause += ' AND (name LIKE ? OR description LIKE ?)'
      const kw = `%${filter.keyword}%`
      params.push(kw, kw)
    }
    if (filter.type) {
      whereClause += ' AND type = ?'
      params.push(filter.type)
    }
    if (filter.categoryId) {
      whereClause += ' AND category_id = ?'
      params.push(filter.categoryId)
    }
    if (filter.favoritesOnly) {
      whereClause += ' AND is_favorite = 1'
    }
    if (filter.tags && filter.tags.length > 0) {
      const tagPlaceholders = filter.tags.map(() => '?').join(',')
      whereClause += ` AND id IN (SELECT credential_id FROM credential_tags WHERE tag_name IN (${tagPlaceholders}))`
      params.push(...filter.tags)
    }
  }
  const sortFieldMap: Record<CredentialSortBy, string> = {
    [CredentialSortBy.NAME]: 'name',
    [CredentialSortBy.CREATED_AT]: 'created_at',
    [CredentialSortBy.UPDATED_AT]: 'updated_at',
    [CredentialSortBy.LAST_USED]: 'last_used_at',
    [CredentialSortBy.USE_COUNT]: 'use_count'
  }
  const ALLOWED_SORT_DIR = new Set(['asc', 'desc', 'ASC', 'DESC'])
  const sortField = sortFieldMap[sortBy] ?? 'updated_at'
  const sortDirSafe = ALLOWED_SORT_DIR.has(String(sortDir))
    ? String(sortDir).toUpperCase()
    : 'DESC'
  const orderClause = `ORDER BY ${sortField} ${sortDirSafe}`
  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM credentials WHERE ${whereClause}`)
    .get(...params) as { count: number }
  const total = countRow.count
  let query = `SELECT * FROM credentials WHERE ${whereClause} ${orderClause}`
  const queryParams: Array<string | number> = [...params]
  if (limit !== undefined) {
    query += ' LIMIT ?'
    queryParams.push(limit)
    if (offset !== undefined) {
      query += ' OFFSET ?'
      queryParams.push(offset)
    }
  }
  const rows = db.prepare(query).all(...queryParams) as CredentialRow[]
  const idList = rows.map((r) => r.id)
  const tagsMap = new Map<string, string[]>()
  if (idList.length > 0) {
    const placeholders = idList.map(() => '?').join(',')
    const tagRows = db
      .prepare(
        `SELECT credential_id, tag_name FROM credential_tags WHERE credential_id IN (${placeholders})`
      )
      .all(...idList) as Array<{ credential_id: string; tag_name: string }>
    for (const t of tagRows) {
      const arr = tagsMap.get(t.credential_id) ?? []
      arr.push(t.tag_name)
      tagsMap.set(t.credential_id, arr)
    }
  }
  const items = rows.map((row) =>
    rowToCredential(row, tagsMap.get(row.id) ?? [], includeSecrets)
  )
  return { items, total }
}

export function recordCredentialUsage(id: string): void {
  const db = getDatabase()
  const now = Date.now()
  db.prepare(
    `
    UPDATE credentials
    SET use_count = use_count + 1, last_used_at = ?
    WHERE id = ?
  `
  ).run(now, id)
}

export function getAllTags(): Tag[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM tags ORDER BY use_count DESC').all() as Array<{
    name: string
    color: string | null
    use_count: number
  }>
  return rows.map((r) => ({
    name: r.name,
    color: r.color || undefined,
    useCount: r.use_count
  }))
}

export function deleteTag(tagName: string): void {
  const db = getDatabase()
  transaction(() => {
    db.prepare('DELETE FROM credential_tags WHERE tag_name = ?').run(tagName)
    db.prepare('DELETE FROM clipboard_tags WHERE tag_name = ?').run(tagName)
    db.prepare('DELETE FROM tags WHERE name = ?').run(tagName)
  })
}
