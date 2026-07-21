-- v2.0 Sprint 8 · TASK-046
-- AI 设置（单例表，id=1）。api_key_encrypted 用 vault DEK 加密。

CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'deepseek',
  api_key_encrypted BLOB,
  base_url TEXT DEFAULT 'https://api.deepseek.com/v1',
  model TEXT DEFAULT 'deepseek-chat',
  local_fallback_enabled INTEGER DEFAULT 0,
  monthly_budget_cents INTEGER DEFAULT 1000,
  updated_at INTEGER
);
