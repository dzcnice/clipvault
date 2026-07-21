-- v2.1 · P0-2 · sync_outbox 双写一致性
--
-- 目的：
--   SQLite + Y.Doc 双写中任一路失败会产生 drift。outbox 行先落盘，
--   再由 replayer 在启动与定时扫描中补齐两路状态，直至两路 applied 为止。
--
-- 状态位：
--   sqlite_applied=1 / ydoc_applied=1 → 两路都落盘，可清理
--   任一为 0 → replayer 会基于 payload_json 重放对应动作
--
-- 失败计数 + last_attempt_at 用于指数退避。
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,              -- 'shared-item' / 'shared-credential' / 'member-update' 等
  op TEXT NOT NULL,                -- 'upsert' / 'delete'
  entity_id TEXT NOT NULL,         -- 操作的主键
  payload_json TEXT NOT NULL,      -- JSON 序列化的 meta（供 Y.Doc 重放）
  sqlite_applied INTEGER NOT NULL DEFAULT 0,  -- 0/1
  ydoc_applied INTEGER NOT NULL DEFAULT 0,    -- 0/1
  created_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox(ydoc_applied, sqlite_applied);
CREATE INDEX IF NOT EXISTS idx_outbox_entity ON sync_outbox(kind, entity_id);
