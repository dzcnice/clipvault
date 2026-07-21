-- 011 凭证使用审计（Sprint 13 · TASK-070）
CREATE TABLE IF NOT EXISTS credential_audit (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL,
  credential_name TEXT,
  actor TEXT NOT NULL DEFAULT 'local-user',
  action TEXT NOT NULL,           -- view|copy|create|update|delete|export|reveal
  timestamp INTEGER NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_credential_audit_credential ON credential_audit(credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_audit_timestamp ON credential_audit(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_credential_audit_action ON credential_audit(action);
