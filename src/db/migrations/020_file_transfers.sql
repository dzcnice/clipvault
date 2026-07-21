-- ============================================================================
-- Migration 020 · v2.1 · file_transfers（端对端文件传输记录）
--
-- 记录每一次文件传输会话：双向（send/recv）、状态机、进度、完成时间。
-- 为 Batch 2C 的 P2P 文件传输通道铺底；其中：
--   status ∈ pending | offering | transferring | done | failed | cancelled | rejected
--   direction ∈ send | recv
--
-- 生命周期：
--   1. Offer 阶段  → pending/offering
--   2. 握手同意后  → transferring（此时持续 updateProgress）
--   3. 结束        → done | failed | cancelled | rejected，记 ended_at
--
-- 清理策略：30 天前的终态（done/failed/cancelled/rejected）由 pruneOldTransfers 清理
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_transfers (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  peer_device_id TEXT NOT NULL,
  peer_display_name TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,
  mime_type TEXT,
  status TEXT NOT NULL,
  bytes_transferred INTEGER DEFAULT 0,
  local_path TEXT,
  error_message TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_file_transfers_status ON file_transfers(status);
CREATE INDEX IF NOT EXISTS idx_file_transfers_peer   ON file_transfers(peer_device_id, started_at);
