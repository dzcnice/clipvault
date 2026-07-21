-- ρ7 · 修复推送到团队报 NOT NULL constraint failed: shared_clipboard.shared_by_member_id
--
-- 背景：v2.0 Sprint 3 时把该列定义成 NOT NULL，但 owner 自己不在 team_members
-- 表里（只记对端），CLIPBOARD_PUSH_TO_TEAM 调用 upsertMirrorItem 时 owner 没有
-- member id 可填，b2 改为传 null 但被 schema NOT NULL 拒绝。
--
-- SQLite 不支持 ALTER COLUMN，本迁移用"重建表 + COPY"的常规手段把
-- shared_by_member_id 改为允许 NULL。
--
-- 幂等性：runMigrations 串行执行，单次成功后版本号写入 schema_version；不会重跑。

PRAGMA foreign_keys = OFF;

CREATE TABLE shared_clipboard__new (
  id TEXT PRIMARY KEY,
  shared_by_member_id TEXT,
  shared_at INTEGER NOT NULL,
  shared_via TEXT NOT NULL DEFAULT 'manual',
  category TEXT NOT NULL DEFAULT 'other',
  tags_json TEXT,
  content_encrypted TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  pinned INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  deleted_at INTEGER,
  FOREIGN KEY (shared_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL
);

INSERT INTO shared_clipboard__new
  (id, shared_by_member_id, shared_at, shared_via, category, tags_json,
   content_encrypted, content_type, pinned, expires_at, deleted_at)
SELECT
  id, shared_by_member_id, shared_at, shared_via, category, tags_json,
  content_encrypted, content_type, pinned, expires_at, deleted_at
FROM shared_clipboard;

DROP TABLE shared_clipboard;
ALTER TABLE shared_clipboard__new RENAME TO shared_clipboard;

CREATE INDEX IF NOT EXISTS idx_shared_clipboard_shared_at ON shared_clipboard(shared_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_pinned ON shared_clipboard(pinned);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_expires ON shared_clipboard(expires_at);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_member ON shared_clipboard(shared_by_member_id);
CREATE INDEX IF NOT EXISTS idx_shared_clipboard_deleted ON shared_clipboard(deleted_at);

PRAGMA foreign_keys = ON;
