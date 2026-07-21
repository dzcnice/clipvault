-- ============================================================================
-- Migration 019 · v2.1 · 自身身份扩展（头像 + 签名）
--
-- 注意：v2.0 的"本机长期身份"实际表名为 team_self_keys（见 004_team_members.sql）。
-- 任务书中称作 self_identity，这里按实际表名 team_self_keys 追加字段：
--   - avatar_blob  BLOB  头像二进制（PNG/JPEG），NULL = 使用默认头像
--   - signature    TEXT  个性签名，默认 ''
--
-- ALTER TABLE ADD COLUMN 在 SQLite 中非幂等；执行器的 tolerantExec 会吞掉
-- "duplicate column name" 错误，保证重入安全。
-- ============================================================================

ALTER TABLE team_self_keys ADD COLUMN avatar_blob BLOB;
ALTER TABLE team_self_keys ADD COLUMN signature  TEXT DEFAULT '';
