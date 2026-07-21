-- Sprint 11 · TASK-057：凭证 TOTP 表
-- 每个凭证至多一条 TOTP 记录（1:1），secret 使用 DEK 加密后存储
CREATE TABLE IF NOT EXISTS credential_totp (
  credential_id TEXT PRIMARY KEY,
  secret_encrypted TEXT NOT NULL,
  issuer TEXT,
  account TEXT,
  algorithm TEXT NOT NULL DEFAULT 'SHA1',
  digits INTEGER NOT NULL DEFAULT 6,
  period INTEGER NOT NULL DEFAULT 30,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_credential_totp_updated ON credential_totp(updated_at DESC);
