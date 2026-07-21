-- ================================================================
-- Migration 021: clipboard_history 内容加密列（v2.1 · C1）
--
-- 背景：
--   README 承诺"所有数据加密存于本机"，但 clipboard_history.content /
--   preview 历史上以明文 TEXT 存储。本迁移为剪贴板内容引入 AEAD
--   密文列，并为渐进式回填保留明文列。
--
-- 设计：
--   - 新增 content_encrypted / content_nonce / preview_encrypted /
--     preview_nonce（BLOB）：AES-256-GCM 结果（cipher 包含 authTag 末尾 16B）
--   - content_plaintext_legacy 标识该行是否仍留有明文；
--     回填完成后 flip 为 0 且明文列置空。
--   - 原 content TEXT / preview TEXT 保留（兼容查询与回退）。
--
-- 幂等：
--   ALTER TABLE ADD COLUMN 不幂等，依赖 runMigrations 对
--   non-transactional 语句逐条执行 + tolerantExec 吞
--   "duplicate column name" 错误。
-- ================================================================

ALTER TABLE clipboard_history ADD COLUMN content_encrypted BLOB;
ALTER TABLE clipboard_history ADD COLUMN content_nonce     BLOB;
ALTER TABLE clipboard_history ADD COLUMN preview_encrypted BLOB;
ALTER TABLE clipboard_history ADD COLUMN preview_nonce     BLOB;
ALTER TABLE clipboard_history ADD COLUMN content_plaintext_legacy INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_clipboard_legacy ON clipboard_history(content_plaintext_legacy);
