-- v2.0 Sprint 8 · TASK-041 / S10 预埋
-- AI 审计日志：每次 Vera 调用记录一条（脱敏后）。

CREATE TABLE IF NOT EXISTS ai_audit_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  permission_level TEXT NOT NULL,
  request_message_redacted TEXT,
  response_message_redacted TEXT,
  function_calls_json TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_cents_estimated INTEGER,
  model TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_session ON ai_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_timestamp ON ai_audit_log(timestamp DESC);
