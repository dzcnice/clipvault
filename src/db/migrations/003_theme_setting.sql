-- ================================================================
-- Migration 003: 主题偏好 (TASK-003)
--
-- 使用现有 settings 表；写入默认 theme.mode = 'system'。
-- 用户通过 UI 切换时以相同 key 写回即可（INSERT OR REPLACE）。
-- ================================================================

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('theme.mode', 'system', strftime('%s', 'now') * 1000);
