-- Sprint 12 · TASK-065 HTTP API Token
CREATE TABLE IF NOT EXISTS http_api_tokens (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  enabled INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_http_tokens_enabled ON http_api_tokens(enabled);
