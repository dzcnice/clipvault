-- ================================================================
-- Migration 002: shortcuts 自定义快捷键表
--
-- 为 v2.0 的快捷键管理框架（TASK-007）准备。
-- 每条记录对应一个命令 ID 及其 accelerator；accelerator 为空字符串表示已禁用。
-- ================================================================

CREATE TABLE IF NOT EXISTS shortcuts (
    command_id TEXT PRIMARY KEY,
    accelerator TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shortcuts_is_default ON shortcuts(is_default);
