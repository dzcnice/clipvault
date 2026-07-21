-- ============================================================================
-- Migration 017 · v2.1 · team_info（单团队元数据）
--
-- 单例表（id=1）记录"我的团队"的基本信息：名称、图标、主色、owner。
-- 配合 team_members 一同构成团队上下文；若已存在 team_members 但尚无
-- team_info 行，自动补一条默认条目以兼容升级路径。
--
-- 与 team_self_keys / team_members 的关系：
--   - team_self_keys  → 本机长期密钥（单行，id=1）
--   - team_members    → 已配对成员列表
--   - team_info       → 本团队外观/owner 元数据（单行，id=1）
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_info (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '我的团队',
  icon_emoji TEXT DEFAULT '👥',
  accent_color TEXT DEFAULT '#7c3aed',
  owner_device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 兼容升级：若已有 team_members 但未记录 team_info，插一条默认行，
-- owner 取 team_self_keys 中的 device_id；否则 fallback 空串（后续由应用层覆盖）。
INSERT OR IGNORE INTO team_info (id, name, owner_device_id, created_at)
SELECT 1, '我的团队',
       COALESCE((SELECT device_id FROM team_self_keys LIMIT 1), ''),
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM team_members LIMIT 1);
