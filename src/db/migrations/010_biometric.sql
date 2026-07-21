-- 010 生物识别解锁（Sprint 13 · TASK-067）
-- 单行配置：保存 safeStorage 加密后的 DEK 信封 + 失败计数
CREATE TABLE IF NOT EXISTS biometric_enrollment (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mechanism TEXT NOT NULL,              -- 'dpapi' | 'touch-id'
  encrypted_dek BLOB NOT NULL,          -- safeStorage 包装的 DEK
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
