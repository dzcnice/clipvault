// @ts-nocheck
/**
 * 剪贴板数据存储层 · v3.1 personal
 * workspace 固定 personal；content 加密 + legacy backfill
 *
 * 工程债：曾从 dist-types 回填，保留 @ts-nocheck。
 * 与 clipboard IPC / preload 契约一致；可按函数逐步补类型后移除 nocheck。
 */

/**
 * 剪贴板数据存储层
 * KR 2.2: 历史记录与快速片? *
 * A-4：置顶上?+ 图片独立 TTL
 * A-5：图片改为磁盘文件（image_path），数据库仅存路? */
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { getDatabase, transaction } from './connection';
import * as imageStore from '../main/storage/image-store';
import * as vault from '../main/crypto/vault';
/**
 * C1 · 剪贴板内容加密错误码（与 credential 路径一致的语义）：
 * vault 未解锁时所有写?/ 解密操作都抛?E_VAULT_LOCKED，不降级为明文? */
export const E_VAULT_LOCKED = 'E_VAULT_LOCKED';
/** backfill 防并发锁：一次只允许一?backfill 任务运行 */
let backfillRunning = false;
/**
 * v3 个人版：workspace 固定 personal（兼容旧库列，不再切 team）? * ?store 覆盖剪贴板历?+ snippet（clipboard_history，is_snippet 区分）? */
const DEFAULT_WORKSPACE = 'personal';
/**
 * C1 · 从数据库行中还原明文 content / preview? *
 * 策略? *   - legacy=0：从密文列解密（vault 未解锁直接抛 E_VAULT_LOCKED? *   - legacy=1：先尝试密文列（部分迁移中状态），失败回退明文? *   - 图片类型?content 为空串是合法的，不触发解? */
function decryptRowContent(row) {
    const hasCipher = row.content_encrypted && row.content_nonce;
    const hasPreviewCipher = row.preview_encrypted && row.preview_nonce;
    // 没有密文也没有明文：空记
    if (!hasCipher && !hasPreviewCipher && !row.content && !row.preview) {
        return { content: null, preview: '' };
    }
    // 如果已回填（legacy=0），必须 vault 解锁才能
    if (row.content_plaintext_legacy === 0 && (hasCipher || hasPreviewCipher)) {
        if (!vault.isUnlocked()) {
            const err = new Error('E_VAULT_LOCKED');
            err.code = E_VAULT_LOCKED;
            throw err;
        }
    }
    let content = null;
    let preview = row.preview ?? '';
    if (hasCipher && vault.isUnlocked()) {
        try {
            content = vault.decryptBytesWithDEK(row.content_encrypted, row.content_nonce);
        }
        catch {
            // 解密失败?fallback 明文（兼容回填中状态）
            content = row.content ?? null;
        }
    }
    else {
        content = row.content ?? null;
    }
    if (hasPreviewCipher && vault.isUnlocked()) {
        try {
            preview = vault.decryptBytesWithDEK(row.preview_encrypted, row.preview_nonce);
        }
        catch {
            preview = row.preview ?? '';
        }
    }
    return { content, preview };
}
/** 将数据库行转换为 ClipboardItem（懒加载 image_path + 解密 content/preview?*/
function rowToClipboardItem(row, tags) {
    let imageData;
    let imagePath;
    if (row.type === 'image') {
        if (row.image_path) {
            imagePath = row.image_path;
            imageData = imageStore.loadImageAsDataUrl(row.image_path) ?? undefined;
        }
        else if (row.image_data) {
            imageData = row.image_data;
        }
    }
    const { content, preview } = decryptRowContent(row);
    return {
        id: row.id,
        type: row.type,
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
    };
}
/** C1 · 抛出统一?vault-locked 错误 */
function assertVaultUnlocked() {
    if (!vault.isUnlocked()) {
        const err = new Error('E_VAULT_LOCKED');
        err.code = E_VAULT_LOCKED;
        throw err;
    }
}
/** 获取剪贴板项的标?*/
function getClipboardTags(clipboardId) {
    const db = getDatabase();
    const rows = db
        .prepare('SELECT tag_name FROM clipboard_tags WHERE clipboard_id = ?')
        .all(clipboardId);
    return rows.map((r) => r.tag_name);
}
/** 生成内容哈希 */
function generateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}
/** 生成预览文本 */
function generatePreview(content, maxLength = 100) {
    if (content.length <= maxLength) {
        return content;
    }
    return content.substring(0, maxLength) + '...';
}
/** 添加剪贴板历史记? *
 * v2.1 · 末尾追加 workspace（默?'personal'），用于区分双轨数据? * v3: personal-only workspace. */
export async function addClipboardItem(input: any, detectedKeyType: any = undefined, workspace: any = DEFAULT_WORKSPACE): Promise<any> {
    const db = getDatabase();
    const now = Date.now();
    const id = uuidv4();
    // compute content/hash
    let content = '';
    let size = 0;
    let imagePath = null;
    if (input.type === 'text' || input.type === 'html') {
        content = input.content || '';
        size = Buffer.byteLength(content, 'utf8');
    }
    else if (input.type === 'image') {
        // A-5：图片写文件
        if (input.imageData) {
            imagePath = await imageStore.saveImageDataUrl(input.imageData);
            // hash 基于?data URL（长度够大足够当去重键）
            content = '';
            // size 近似?base64 字节长度
            size = input.imageData.length;
        }
    }
    else if (input.type === 'file') {
        content = input.filePath || '';
        size = content.length;
    }
    const hashSource = input.type === 'image' ? input.imageData || imagePath || '' : content;
    const hash = generateHash(hashSource);
    // 检查是否已存在相同内容（去重）
    const existing = db
        .prepare('SELECT id FROM clipboard_history WHERE hash = ? AND is_snippet = 0')
        .get(hash);
    if (existing) {
        // 命中旧记录，删除本次新写的临时图
        if (imagePath)
            imageStore.deleteImageFile(imagePath);
        db.prepare(`
      UPDATE clipboard_history
      SET created_at = ?, use_count = use_count + 1, last_used_at = ?
      WHERE id = ?
    `).run(now, now, existing.id);
        return getClipboardItemById(existing.id);
    }
    const preview = generatePreview(input.type === 'image'
        ? '[图片]'
        : input.content || input.filePath || '[图片]');
    // C1 · 写入前强制要?vault 解锁（不降级为明文）
    assertVaultUnlocked();
    const plainContent = input.type === 'text' || input.type === 'html' ? content : '';
    const { cipher: contentCipher, nonce: contentNonce } = vault.encryptBytesWithDEK(plainContent);
    const { cipher: previewCipher, nonce: previewNonce } = vault.encryptBytesWithDEK(preview);
    // 17 个 ?：content/preview 明文列置空，密文走 *_encrypted 列
    db.prepare(`
    INSERT INTO clipboard_history
    (id, type, content, image_data, image_path, file_path, preview, hash, size, source_app,
     is_pinned, is_snippet, detected_key_type, created_at, use_count, workspace,
     content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?, ?, ?, 0)
  `).run(
      id,
      input.type,
      null, // content plaintext empty
      null, // image_data unused for new images
      imagePath,
      input.filePath || null,
      '', // preview NOT NULL; ciphertext in preview_encrypted
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
    );
    // 清理超出限制的旧记录（含图片 TTL）
    cleanupOldHistory();
    return getClipboardItemById(id);
}
/** 获取单个剪贴板项 */
export function getClipboardItemById(id: any): any {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM clipboard_history WHERE id = ?').get(id);
    if (!row) {
        return null;
    }
    const tags = getClipboardTags(id);
    return rowToClipboardItem(row, tags);
}
/** 查询剪贴板历? *
 * v2.1 · 末尾追加 workspace 过滤（默?'personal'）? * v3: personal-only workspace. */
export function listClipboardHistory(filter: any = undefined, limit: any = 100, offset: any = 0, workspace: any = DEFAULT_WORKSPACE): any {
    const db = getDatabase();
    let whereClause = 'workspace = ?';
    const params = [workspace];
    // C1 · keyword 在加密列上无?LIKE，改为解密后在内存中过滤?  // SQL 层不再附?keyword 条件；其余过滤（type / pinned / tags 等）仍走 SQL
    const memoryKeyword = filter?.keyword?.trim() || '';
    if (filter) {
        if (filter.type) {
            whereClause += ' AND type = ?';
            params.push(filter.type);
        }
        if (filter.pinnedOnly) {
            whereClause += ' AND is_pinned = 1';
        }
        if (filter.snippetsOnly) {
            whereClause += ' AND is_snippet = 1';
        }
        if (filter.detectedKeyType) {
            whereClause += ' AND detected_key_type = ?';
            params.push(filter.detectedKeyType);
        }
        if (filter.startTime) {
            whereClause += ' AND created_at >= ?';
            params.push(filter.startTime);
        }
        if (filter.endTime) {
            whereClause += ' AND created_at <= ?';
            params.push(filter.endTime);
        }
        if (filter.tags && filter.tags.length > 0) {
            const tagPlaceholders = filter.tags.map(() => '?').join(',');
            whereClause += ` AND id IN (SELECT clipboard_id FROM clipboard_tags WHERE tag_name IN (${tagPlaceholders}))`;
            params.push(...filter.tags);
        }
    }
    // 没有 keyword：SQL 直接分页?total ?rows（性能路径?  // ?keyword：拉取全部候选行，解密后内存过滤 + 分页（性能够用，v2.1 历史上限 500
    if (!memoryKeyword) {
        const countRow = db
            .prepare(`SELECT COUNT(*) as count FROM clipboard_history WHERE ${whereClause}`)
            .get(...params);
        const total = countRow.count;
        const rows = db
            .prepare(`
      SELECT * FROM clipboard_history
      WHERE ${whereClause}
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT ? OFFSET ?
    `)
            .all(...params, limit, offset);
        return { items: rowsToItems(rows), total };
    }
    // keyword 路径：先按其余过滤条件全量取回，再解?+ in-memory 过滤
    const allRows = db
        .prepare(`
      SELECT * FROM clipboard_history
      WHERE ${whereClause}
      ORDER BY is_pinned DESC, created_at DESC
    `)
        .all(...params);
    const allItems = rowsToItems(allRows);
    const kwLower = memoryKeyword.toLowerCase();
    const filtered = allItems.filter((it) => {
        const hay = `${it.content ?? ''}\n${it.preview ?? ''}\n${it.snippetName ?? ''}`;
        return hay.toLowerCase().includes(kwLower);
    });
    const paged = filtered.slice(offset, offset + limit);
    return { items: paged, total: filtered.length };
}
/** 内部工具：批量将?+ tags 转成 ClipboardItem[] */
function rowsToItems(rows) {
    if (rows.length === 0)
        return [];
    const db = getDatabase();
    const idList = rows.map((r) => r.id);
    const tagsMap = new Map();
    const placeholders = idList.map(() => '?').join(',');
    const tagRows = db
        .prepare(`SELECT clipboard_id, tag_name FROM clipboard_tags WHERE clipboard_id IN (${placeholders})`)
        .all(...idList);
    for (const t of tagRows) {
        const arr = tagsMap.get(t.clipboard_id) ?? [];
        arr.push(t.tag_name);
        tagsMap.set(t.clipboard_id, arr);
    }
    return rows.map((row) => rowToClipboardItem(row, tagsMap.get(row.id) ?? []));
}
/**
 * 返回图片项的磁盘绝对路径（不存在?null? * 供「复制路径给终端」使? */
export function getClipboardImagePath(id: any): any {
    const db = getDatabase();
    const row = db
        .prepare('SELECT type, image_path FROM clipboard_history WHERE id = ?')
        .get(id);
    if (!row || row.type !== 'image' || !row.image_path)
        return null;
    return row.image_path;
}
/** 删除剪贴板项（同步清理图片文件） */
export function deleteClipboardItem(id: any): any {
    const db = getDatabase();
    const row = db
        .prepare('SELECT image_path FROM clipboard_history WHERE id = ?')
        .get(id);
    if (row?.image_path) {
        imageStore.deleteImageFile(row.image_path);
    }
    const result = db.prepare('DELETE FROM clipboard_history WHERE id = ?').run(id);
    return result.changes > 0;
}
/** 清空剪贴板历史（保留置顶和快速片段） */
export function clearClipboardHistory(): any {
    const db = getDatabase();
    // 先把将被删除行的 image_path 捞出来逐个 unlink
    const rows = db
        .prepare('SELECT image_path FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0 AND image_path IS NOT NULL')
        .all();
    for (const r of rows) {
        imageStore.deleteImageFile(r.image_path);
    }
    const result = db
        .prepare('DELETE FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0')
        .run();
    return result.changes;
}
/** 切换置顶状态（A-4：同?pinned_at?*/
export function toggleClipboardPin(id: any): any {
    const db = getDatabase();
    const row = db.prepare('SELECT is_pinned FROM clipboard_history WHERE id = ?').get(id);
    if (!row) {
        return false;
    }
    const newValue = row.is_pinned === 1 ? 0 : 1;
    db.prepare('UPDATE clipboard_history SET is_pinned = ?, pinned_at = ? WHERE id = ?').run(newValue, newValue === 1 ? Date.now() : null, id);
    return newValue === 1;
}
/** 记录使用 */
export function recordClipboardUsage(id: any): void {
    const db = getDatabase();
    const now = Date.now();
    db.prepare(`
    UPDATE clipboard_history
    SET use_count = use_count + 1, last_used_at = ?
    WHERE id = ?
  `).run(now, id);
}
/** 创建快速片? *
 * v2.1 · 末尾追加 workspace（默?'personal'）? * v3: personal-only workspace. */
export function createSnippet(input: any, workspace: any = DEFAULT_WORKSPACE): any {
    return transaction(() => {
        const db = getDatabase();
        const now = Date.now();
        const id = uuidv4();
        const hash = generateHash(input.content);
        const preview = generatePreview(input.content);
        const size = Buffer.byteLength(input.content, 'utf8');
        assertVaultUnlocked();
        const { cipher: contentCipher, nonce: contentNonce } = vault.encryptBytesWithDEK(input.content);
        const { cipher: previewCipher, nonce: previewNonce } = vault.encryptBytesWithDEK(preview);
        db.prepare(`
      INSERT INTO clipboard_history
      (id, type, content, preview, hash, size, is_pinned, is_snippet, snippet_name, snippet_shortcut, created_at, use_count, workspace,
       content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy)
      VALUES (?, 'text', ?, ?, ?, ?, 0, 1, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)
    `).run(id, null, '', hash, size, input.name, input.shortcut || null, now, workspace, contentCipher, contentNonce, previewCipher, previewNonce);
        if (input.tags && input.tags.length > 0) {
            const insertTag = db.prepare('INSERT INTO clipboard_tags (clipboard_id, tag_name) VALUES (?, ?)');
            for (const tag of input.tags) {
                insertTag.run(id, tag);
            }
        }
        const created = getClipboardItemById(id);
        if (!created) throw new Error('createSnippet: row missing after insert');
        return created;
    });
}
/** 更新快速片?*/
export function updateSnippet(input: any): any {
    return transaction(() => {
        const db = getDatabase();
        const existing = getClipboardItemById(input.id);
        if (!existing || !existing.isSnippet) {
            return null;
        }
        const updates = [];
        const values = [];
        if (input.content !== undefined) {
            assertVaultUnlocked();
            const previewText = generatePreview(input.content);
            const { cipher: cc, nonce: cn } = vault.encryptBytesWithDEK(input.content);
            const { cipher: pc, nonce: pn } = vault.encryptBytesWithDEK(previewText);
            updates.push('content = ?', 'preview = ?', 'hash = ?', 'size = ?', 'content_encrypted = ?', 'content_nonce = ?', 'preview_encrypted = ?', 'preview_nonce = ?', 'content_plaintext_legacy = 0');
            // preview NOT NULL → 空串；content 可 NULL
            values.push(null, '', generateHash(input.content), Buffer.byteLength(input.content, 'utf8'), cc, cn, pc, pn);
        }
        if (input.name !== undefined) {
            updates.push('snippet_name = ?');
            values.push(input.name);
        }
        if (input.shortcut !== undefined) {
            updates.push('snippet_shortcut = ?');
            values.push(input.shortcut || null);
        }
        if (input.isPinned !== undefined) {
            updates.push('is_pinned = ?');
            values.push(input.isPinned ? 1 : 0);
        }
        if (updates.length > 0) {
            values.push(input.id);
            db.prepare(`UPDATE clipboard_history SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
        if (input.tags !== undefined) {
            db.prepare('DELETE FROM clipboard_tags WHERE clipboard_id = ?').run(input.id);
            if (input.tags.length > 0) {
                const insertTag = db.prepare('INSERT INTO clipboard_tags (clipboard_id, tag_name) VALUES (?, ?)');
                for (const tag of input.tags) {
                    insertTag.run(input.id, tag);
                }
            }
        }
        return getClipboardItemById(input.id);
    });
}
/** 获取所有快速片段（批量?tags 避免 N+1? *
 * v2.1 · 追加 workspace 过滤（默?'personal'）? * v3: personal-only workspace. */
export function getSnippets(workspace: any = DEFAULT_WORKSPACE): any {
    const db = getDatabase();
    const rows = db
        .prepare(`
    SELECT * FROM clipboard_history
    WHERE is_snippet = 1 AND workspace = ?
    ORDER BY snippet_name ASC
  `)
        .all(workspace);
    const idList = rows.map((r) => r.id);
    const tagsMap = new Map();
    if (idList.length > 0) {
        const placeholders = idList.map(() => '?').join(',');
        const tagRows = db
            .prepare(`SELECT clipboard_id, tag_name FROM clipboard_tags WHERE clipboard_id IN (${placeholders})`)
            .all(...idList);
        for (const t of tagRows) {
            const arr = tagsMap.get(t.clipboard_id) ?? [];
            arr.push(t.tag_name);
            tagsMap.set(t.clipboard_id, arr);
        }
    }
    return rows.map((row) => rowToClipboardItem(row, tagsMap.get(row.id) ?? []));
}
/** 清理常量（A-4） */
const MAX_HISTORY_DEFAULT = 500;
const MAX_PINNED = 200;
const IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NON_IMAGE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
/**
 * 清理超出限制的旧历史记录 + 置顶条数上限 + 图片 TTL
 */
function cleanupOldHistory(maxSize = MAX_HISTORY_DEFAULT) {
    const db = getDatabase();
    // 1) 普通历史（非置顶、非片段）超上限：按 created_at 最旧删
    const nonPinnedCount = db
        .prepare('SELECT COUNT(*) as count FROM clipboard_history WHERE is_pinned = 0 AND is_snippet = 0')
        .get();
    if (nonPinnedCount.count > maxSize) {
        const deleteCount = nonPinnedCount.count - maxSize;
        const rows = db
            .prepare(`
        SELECT id, image_path FROM clipboard_history
        WHERE is_pinned = 0 AND is_snippet = 0
        ORDER BY created_at ASC
        LIMIT ?
      `)
            .all(deleteCount);
        const ids = rows.map((r) => r.id);
        if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            db.prepare(`DELETE FROM clipboard_history WHERE id IN (${placeholders})`).run(...ids);
            for (const r of rows) {
                if (r.image_path)
                    imageStore.deleteImageFile(r.image_path);
            }
        }
    }
    // 2) 置顶条数上限（A-4）：?pinned_at ASC（没写过 pinned_at 的记录视?0，会被优先删
    const pinnedCount = db
        .prepare('SELECT COUNT(*) as count FROM clipboard_history WHERE is_pinned = 1 AND is_snippet = 0')
        .get();
    if (pinnedCount.count > MAX_PINNED) {
        const extra = pinnedCount.count - MAX_PINNED;
        const rows = db
            .prepare(`
        SELECT id, image_path FROM clipboard_history
        WHERE is_pinned = 1 AND is_snippet = 0
        ORDER BY COALESCE(pinned_at, 0) ASC
        LIMIT ?
      `)
            .all(extra);
        const ids = rows.map((r) => r.id);
        if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            db.prepare(`DELETE FROM clipboard_history WHERE id IN (${placeholders})`).run(...ids);
            for (const r of rows) {
                if (r.image_path)
                    imageStore.deleteImageFile(r.image_path);
            }
        }
    }
    // 3) 图片 TTL（A-4）：image 类型且非置顶、非片段、且超过 30 天的全部清理
    const imageTtlCutoff = Date.now() - IMAGE_TTL_MS;
    const oldImages = db
        .prepare(`
      SELECT id, image_path FROM clipboard_history
      WHERE type = 'image' AND is_pinned = 0 AND is_snippet = 0 AND created_at < ?
    `)
        .all(imageTtlCutoff);
    if (oldImages.length > 0) {
        const ids = oldImages.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM clipboard_history WHERE id IN (${placeholders})`).run(...ids);
        for (const r of oldImages) {
            if (r.image_path)
                imageStore.deleteImageFile(r.image_path);
        }
    }
    // NON_IMAGE_TTL_MS 常量当前通过 maxSize 间接控制条数（保留供未来直接启用 TTL 用）
    void NON_IMAGE_TTL_MS;
}
/**
 * C1 · 回填剪贴板明文列到密文列? *
 * 触发点：vault 首次解锁成功后（vault-handlers / biometric / safestorage 路径）? * 幂等：只处理 content_plaintext_legacy = 1 的行；完成后 flip ?0 并清空明文列? * 并发：进程内 backfillRunning 锁；前一次未结束时立即返回? *
 * 返回：{ scanned, migrated, skipped } 供调用方打日志? * 异常策略：单行失败不会中断整体；失败行保?legacy=1 下次再试? */
export async function backfillClipboardEncryption(onProgress: any = undefined): Promise<any> {
    if (backfillRunning) {
        return { scanned: 0, migrated: 0, skipped: 0 };
    }
    if (!vault.isUnlocked()) {
        return { scanned: 0, migrated: 0, skipped: 0 };
    }
    backfillRunning = true;
    try {
        const db = getDatabase();
        const rows = db
            .prepare(`SELECT id, content, preview FROM clipboard_history
         WHERE content_plaintext_legacy = 1`)
            .all();
        let migrated = 0;
        let skipped = 0;
        // preview 列 schema 为 NOT NULL，不能写 NULL，改用空串；content 可 NULL
        const update = db.prepare(`UPDATE clipboard_history
       SET content_encrypted = ?, content_nonce = ?,
           preview_encrypted = ?, preview_nonce = ?,
           content = NULL, preview = '',
           content_plaintext_legacy = 0
       WHERE id = ? AND content_plaintext_legacy = 1`);
        const total = rows.length;
        // U5 · 初始进度（便?UI 立刻显示进度条；0/0 时也显式通知一次）
        if (onProgress) {
            try {
                onProgress({ done: 0, total });
            }
            catch {
                /* ignore listener error */
            }
        }
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const plainContent = row.content ?? '';
                const plainPreview = row.preview ?? '';
                const { cipher: cc, nonce: cn } = vault.encryptBytesWithDEK(plainContent);
                const { cipher: pc, nonce: pn } = vault.encryptBytesWithDEK(plainPreview);
                update.run(cc, cn, pc, pn, row.id);
                migrated += 1;
            }
            catch {
                skipped += 1;
            }
            const done = i + 1;
            // U5 · ?50 条或最后一条推一次进
            if (onProgress && (done % 50 === 0 || done === total)) {
                try {
                    onProgress({ done, total });
                }
                catch {
                    /* ignore listener error */
                }
            }
        }
        return { scanned: total, migrated, skipped };
    }
    finally {
        backfillRunning = false;
    }
}
/** 根据哈希查找记录 */
export function findByHash(hash: any): any {
    const db = getDatabase();
    const row = db
        .prepare('SELECT * FROM clipboard_history WHERE hash = ? LIMIT 1')
        .get(hash);
    if (!row) {
        return null;
    }
    const tags = getClipboardTags(row.id);
    return rowToClipboardItem(row, tags);
}
