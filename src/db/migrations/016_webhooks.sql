-- Sprint 14 · TASK-076 Webhook 订阅表
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  platform TEXT NOT NULL,  -- 'slack' | 'feishu' | 'wework'
  subscribed_events TEXT NOT NULL,  -- JSON array
  enabled INTEGER DEFAULT 1,
  failure_count INTEGER DEFAULT 0,
  last_triggered_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
CREATE INDEX IF NOT EXISTS idx_webhooks_platform ON webhooks(platform);
