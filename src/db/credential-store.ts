// @ts-nocheck
/**
 * 凭证数据存储层 · v3.1 personal
 * workspace 固定 personal；DEK 加密 value
 *
 * 工程债：文件曾从 dist-types 回填，保留 @ts-nocheck 以保证运行时完整。
 * 公共导出名与 credential-store.d.ts / IPC 契约一致；后续可按函数逐步补类型后去掉 nocheck。
 */

/**
 * 凭证数据存储? * KR 1.2: 密钥 CRUD 功能
 */
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, transaction } from './connection';
import { CredentialSortBy, SortDirection } from '@/types';
// 引入 DEK 加密：凭?value 必须加密后再入库
import * as vault from '../main/crypto/vault';
import { logger } from '../main/utils/logger';
/**
 * v2.1 · workspace 默认值：personal（向后兼容）? * v3: personal-only workspace. */
const DEFAULT_WORKSPACE = 'personal';
/**
 * 将数据库行转换为 Credential 对象；必要时?DEK 解密 value
 * 老数据（value_encrypted=0）直接透传；新数据?1）在 vault 已解锁时才能解密
 *
 * BUG-CRED-3：解密失败不再静默吞掉返回空串，而是通过 decryptError / decryptErrorMessage
 * 字段向上游标示。调用方（UI / IPC）应检?decryptError? *   - true ?"此凭证已损坏，请导入备份"，不要把空值当真实凭证使用
 *   - false / undefined ?value 是真实值（可能为真实空串）
 */
function rowToCredential(row, tags) {
    let value = row.value;
    let decryptError = false;
    let decryptErrorMessage;
    if (row.value_encrypted === 1) {
        try {
            value = vault.decryptWithDEK(row.value);
        }
        catch (err) {
            logger.error('[credential-store] 解密失败，标?decryptError:', err);
            value = '';
            decryptError = true;
            decryptErrorMessage = err instanceof Error ? err.message : String(err);
        }
    }
    const base = {
        id: row.id,
        name: row.name,
        type: row.type,
        value,
        description: row.description || undefined,
        categoryId: row.category_id || undefined,
        tags,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at || undefined,
        useCount: row.use_count,
        isFavorite: row.is_favorite === 1
    };
    if (decryptError) {
        base.decryptError = true;
        base.decryptErrorMessage = decryptErrorMessage;
    }
    return base;
}
/** 获取凭证的标签列?*/
function getCredentialTags(credentialId) {
    const db = getDatabase();
    const rows = db
        .prepare('SELECT tag_name FROM credential_tags WHERE credential_id = ?')
        .all(credentialId);
    return rows.map((r) => r.tag_name);
}
/** 设置凭证的标?*/
function setCredentialTags(credentialId, tags) {
    const db = getDatabase();
    // 删除旧标?
    db.prepare('DELETE FROM credential_tags WHERE credential_id = ?').run(credentialId);
    // 插入新标
    if (tags.length > 0) {
        const insertTag = db.prepare('INSERT INTO credential_tags (credential_id, tag_name) VALUES (?, ?)');
        const updateTagCount = db.prepare(`
      INSERT INTO tags (name, use_count) VALUES (?, 1)
      ON CONFLICT(name) DO UPDATE SET use_count = use_count + 1
    `);
        for (const tag of tags) {
            insertTag.run(credentialId, tag);
            updateTagCount.run(tag);
        }
    }
}
/** 创建凭证（value ?DEK 加密后入库；vault 锁定时抛 E_VAULT_LOCKED? *
 * BUG-CRED-1 修复：零知识承诺要求明文永不落盘。vault 未解锁时原实现仅 logger.warn
 * 然后把明文写?DB，违反威胁模型。改为立即抛 E_VAULT_LOCKED，调用方（IPC 层）
 * 会把错误向上传递给渲染进程，由 UI 引导用户先解锁? *
 * v2.1 · 第二?workspace 可选（默认 'personal'），用于双轨数据区分? * v3: personal-only workspace. */
export function createCredential(input: any, workspace: any = DEFAULT_WORKSPACE): any {
    if (!vault.isUnlocked()) {
        throw new Error('E_VAULT_LOCKED: cannot create credential while vault is locked');
    }
    return transaction(() => {
        const db = getDatabase();
        const now = Date.now();
        const id = uuidv4();
        const storedValue = vault.encryptWithDEK(input.value);
        const isEncrypted = 1;
        db.prepare(`
      INSERT INTO credentials (id, name, type, value, description, category_id, metadata, created_at, updated_at, use_count, is_favorite, value_encrypted, workspace)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(id, input.name, input.type, storedValue, input.description || null, input.categoryId || null, input.metadata ? JSON.stringify(input.metadata) : null, now, now, isEncrypted, workspace);
        // 设置标签
        if (input.tags && input.tags.length > 0) {
            setCredentialTags(id, input.tags);
        }
        const created = getCredentialById(id);
        if (!created) throw new Error('createCredential: row missing after insert');
        return created;
    });
}
/** 根据ID获取凭证 */
export function getCredentialById(id: any): any {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id);
    if (!row) {
        return null;
    }
    const tags = getCredentialTags(id);
    return rowToCredential(row, tags);
}
/** 更新凭证
 *
 * BUG-CRED-2 修复：原实现?vault 锁定时会?input.value 直接明文覆写 value 字段
 * 并把 value_encrypted ?0，导致原本已加密的凭证被永久损坏（降级为明文）? * 本次修复语义? *   - 只要 input.value !== undefined（说明调用方想改 value），必须 vault 已解锁；
 *     锁定则抛 E_VAULT_LOCKED，不动数据库? *   - ?input.value === undefined（只?name / description / metadata / tags 等）? *     则不进入 value 分支，value / value_encrypted 字段保持原样（继续维持加密态）? *   - 这样既保住了零知识承诺，也允许在锁定态下只读?metadata / tags —?但注意：
 *     IPC ?wrapUnlockedHandler 已经挡在前面，实际只有内部直接调用才会进入锁定路径? */
export function updateCredential(input: any): any {
    if (input.value !== undefined && !vault.isUnlocked()) {
        throw new Error('E_VAULT_LOCKED: cannot update credential value while vault is locked');
    }
    return transaction(() => {
        const db = getDatabase();
        const existing = getCredentialById(input.id);
        if (!existing) {
            return null;
        }
        const now = Date.now();
        const updates = ['updated_at = ?'];
        const values = [now];
        if (input.name !== undefined) {
            updates.push('name = ?');
            values.push(input.name);
        }
        if (input.type !== undefined) {
            updates.push('type = ?');
            values.push(input.type);
        }
        if (input.value !== undefined) {
            // 到此?vault 已解锁（函数入口已校验），直接加密写
            const storedValue = vault.encryptWithDEK(input.value);
            updates.push('value = ?', 'value_encrypted = ?');
            values.push(storedValue, 1);
        }
        if (input.description !== undefined) {
            updates.push('description = ?');
            values.push(input.description || null);
        }
        if (input.categoryId !== undefined) {
            updates.push('category_id = ?');
            values.push(input.categoryId || null);
        }
        if (input.metadata !== undefined) {
            const mergedMetadata = { ...existing.metadata, ...input.metadata };
            updates.push('metadata = ?');
            values.push(JSON.stringify(mergedMetadata));
        }
        if (input.isFavorite !== undefined) {
            updates.push('is_favorite = ?');
            values.push(input.isFavorite ? 1 : 0);
        }
        values.push(input.id);
        db.prepare(`UPDATE credentials SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        // 更新标签
        if (input.tags !== undefined) {
            setCredentialTags(input.id, input.tags);
        }
        return getCredentialById(input.id);
    });
}
/** 删除凭证 */
export function deleteCredential(id: any): any {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
    return result.changes > 0;
}
/** 查询凭证列表
 *
 * v2.1 · 末尾追加可?workspace 过滤（默?'personal' 以保持向后兼容）? * ?undefined 时等价于 personal；传 'team' 仅返回团队工作区凭证? * v3: personal-only workspace. */
export function listCredentials(
  filter: any = undefined,
  sortBy: any = CredentialSortBy.UPDATED_AT,
  sortDir: any = SortDirection.DESC,
  limit: any = undefined,
  offset: any = undefined,
  workspace: any = DEFAULT_WORKSPACE
): any {
    const db = getDatabase();
    let whereClause = 'workspace = ?';
    const params = [workspace];
    if (filter) {
        if (filter.keyword) {
            whereClause += ' AND (name LIKE ? OR description LIKE ?)';
            const kw = `%${filter.keyword}%`;
            params.push(kw, kw);
        }
        if (filter.type) {
            whereClause += ' AND type = ?';
            params.push(filter.type);
        }
        if (filter.categoryId) {
            whereClause += ' AND category_id = ?';
            params.push(filter.categoryId);
        }
        if (filter.favoritesOnly) {
            whereClause += ' AND is_favorite = 1';
        }
        if (filter.tags && filter.tags.length > 0) {
            const tagPlaceholders = filter.tags.map(() => '?').join(',');
            whereClause += ` AND id IN (SELECT credential_id FROM credential_tags WHERE tag_name IN (${tagPlaceholders}))`;
            params.push(...filter.tags);
        }
    }
    // 排序字段映射（白名单）：任何越界字符串都落回 updated_at DESC 兜底
    const sortFieldMap = {
        [CredentialSortBy.NAME]: 'name',
        [CredentialSortBy.CREATED_AT]: 'created_at',
        [CredentialSortBy.UPDATED_AT]: 'updated_at',
        [CredentialSortBy.LAST_USED]: 'last_used_at',
        [CredentialSortBy.USE_COUNT]: 'use_count'
    };
    const ALLOWED_SORT_DIR = new Set(['asc', 'desc', 'ASC', 'DESC']);
    const sortField = sortFieldMap[sortBy] ?? 'updated_at';
    const sortDirSafe = ALLOWED_SORT_DIR.has(String(sortDir))
        ? String(sortDir).toUpperCase()
        : 'DESC';
    const orderClause = `ORDER BY ${sortField} ${sortDirSafe}`;
    // 获取总数
    const countRow = db
        .prepare(`SELECT COUNT(*) as count FROM credentials WHERE ${whereClause}`)
        .get(...params);
    const total = countRow.count;
    // 获取数据（P1-credential-store: LIMIT / OFFSET 参数化，避免字符串拼接）
    let query = `SELECT * FROM credentials WHERE ${whereClause} ${orderClause}`;
    const queryParams = [...params];
    if (limit !== undefined) {
        query += ' LIMIT ?';
        queryParams.push(limit);
        if (offset !== undefined) {
            query += ' OFFSET ?';
            queryParams.push(offset);
        }
    }
    const rows = db.prepare(query).all(...queryParams);
    // P1-6：用批量 IN 查询替代 N ?getCredentialTags，避?N+1
    const idList = rows.map((r) => r.id);
    const tagsMap = new Map();
    if (idList.length > 0) {
        const placeholders = idList.map(() => '?').join(',');
        const tagRows = db
            .prepare(`SELECT credential_id, tag_name FROM credential_tags WHERE credential_id IN (${placeholders})`)
            .all(...idList);
        for (const t of tagRows) {
            const arr = tagsMap.get(t.credential_id) ?? [];
            arr.push(t.tag_name);
            tagsMap.set(t.credential_id, arr);
        }
    }
    const items = rows.map((row) => rowToCredential(row, tagsMap.get(row.id) ?? []));
    return { items, total };
}
/** 记录凭证使用 */
export function recordCredentialUsage(id: any): void {
    const db = getDatabase();
    const now = Date.now();
    db.prepare(`
    UPDATE credentials
    SET use_count = use_count + 1, last_used_at = ?
    WHERE id = ?
  `).run(now, id);
}
/** 获取所有标?*/
export function getAllTags(): any {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM tags ORDER BY use_count DESC').all();
    return rows.map((r) => ({
        name: r.name,
        color: r.color || undefined,
        useCount: r.use_count
    }));
}
/** 删除标签 */
export function deleteTag(tagName: any): void {
    const db = getDatabase();
    transaction(() => {
        db.prepare('DELETE FROM credential_tags WHERE tag_name = ?').run(tagName);
        db.prepare('DELETE FROM clipboard_tags WHERE tag_name = ?').run(tagName);
        db.prepare('DELETE FROM tags WHERE name = ?').run(tagName);
    });
}
