-- v2.0 Sprint 3 / TASK-017：团队剪贴板（Y.Doc 的 SQLite 镜像）
--
-- Y.Doc 提供 CRDT 合并语义，本表用于本地 SQL 查询（搜索/分页/过滤）。
-- content_encrypted 是用 team-shared-key 做 XChaCha20-Poly1305 加密的 base64
-- （格式 "nonce:cipher" base64，nonce=24B）。
-- 7 天过期清理由后台任务扫描 expires_at 完成（pinned=1 不清）。

CREATE TABLE IF NOT EXISTS shared_clipboard (
  id TEXT PRIMARY KEY,
  shared_by_member_id TEXT NOT NULL,
  shared_at INTEGER NOT NULL,
  shared_via TEXT NOT NULL DEFAULT 'manual',
  category TEXT NOT NULL DEFAULT 'other',
  tags_json TEXT,
  -- 加密后内容（"nonce:cipher" base64 双段）
  content_encrypted TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  pinned INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  deleted_at INTEGER,
  FOREIGN KEY (shared_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_clipboard_shared_at ON shared_clipboard(shared_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_pinned ON shared_clipboard(pinned);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_expires ON shared_clipboard(expires_at);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_member ON shared_clipboard(shared_by_member_id);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_deleted ON shared_clipboard(deleted_at);
