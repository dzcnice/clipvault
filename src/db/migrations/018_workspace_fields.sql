-- ============================================================================
-- Migration 018 · v2.1 · workspace 双轨字段
--
-- 给现有业务表追加 workspace 字段，区分"个人 / 团队"上下文：
--   - credentials        → workspace
--   - clipboard_history  → workspace（snippet 记录以 is_snippet=1 一并覆盖，
--                          本项目没有独立 snippets 表）
--
-- 默认值 'personal' 保证历史数据无缝兼容。ALTER TABLE ADD COLUMN 在 SQLite
-- 中非幂等（重复执行会报 "duplicate column name"），执行器层统一用 safeAlter
-- 包住（detail 见 src/db/migrations/index.ts 的 tolerantExec）。
-- ============================================================================

ALTER TABLE credentials        ADD COLUMN workspace TEXT DEFAULT 'personal';
ALTER TABLE clipboard_history  ADD COLUMN workspace TEXT DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS idx_cred_workspace ON credentials(workspace);
CREATE INDEX IF NOT EXISTS idx_clip_workspace ON clipboard_history(workspace);

-- 旧行 NULL → 'personal'（向后兼容，无条件重写保底）
UPDATE credentials       SET workspace = 'personal' WHERE workspace IS NULL;
UPDATE clipboard_history SET workspace = 'personal' WHERE workspace IS NULL;
