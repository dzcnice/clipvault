-- v2.0 Sprint 4 / TASK-021：团队凭证（独立空间）
--
-- 团队凭证与个人凭证完全隔离，不共表。
-- value_encrypted 用 team-shared-key 做 XChaCha20-Poly1305 加密（"nonce:cipher" base64）。
-- 仅 owner 和 createdByMemberId 可修改/删除（应用层校验）。

CREATE TABLE IF NOT EXISTS shared_credentials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  description TEXT,
  tags_json TEXT,
  created_by_member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (created_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_credentials_name ON shared_credentials(name);
CREATE INDEX IF NOT EXISTS idx_shared_credentials_type ON shared_credentials(type);
CREATE INDEX IF NOT EXISTS idx_shared_credentials_creator ON shared_credentials(created_by_member_id);
CREATE INDEX IF NOT EXISTS idx_shared_credentials_deleted ON shared_credentials(deleted_at);
