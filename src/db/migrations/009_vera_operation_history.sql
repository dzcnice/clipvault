-- Vera 自动化操作历史（v2.0 Sprint 9 · TASK-051 预埋）
-- 阶段一：建表 + 索引；阶段二接入 executor / undo

CREATE TABLE IF NOT EXISTS vera_operation_history (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_snapshot TEXT,
  after_snapshot TEXT,
  reversible INTEGER NOT NULL,
  executed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vera_op_history_plan ON vera_operation_history(plan_id);
CREATE INDEX IF NOT EXISTS idx_vera_op_history_expires ON vera_operation_history(expires_at);
