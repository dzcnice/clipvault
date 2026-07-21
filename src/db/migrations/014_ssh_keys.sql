-- Sprint 12 · TASK-064 SSH Key 代管
CREATE TABLE IF NOT EXISTS ssh_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted BLOB NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ssh_keys_created ON ssh_keys(created_at DESC);
