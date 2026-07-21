-- ================================================================
-- Migration 001: initial schema
--
-- 包含 v1.0 的完整 schema（从原 connection.ts 内联 SQL 迁移而来）。
-- 注意：此文件是「文档」形式，与 definitions.ts 内的 SQL 字符串保持一致。
-- ================================================================

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- 凭证表
CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category_id TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_used_at INTEGER,
    use_count INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    value_encrypted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);
CREATE INDEX IF NOT EXISTS idx_credentials_category ON credentials(category_id);
CREATE INDEX IF NOT EXISTS idx_credentials_name ON credentials(name);
CREATE INDEX IF NOT EXISTS idx_credentials_favorite ON credentials(is_favorite);

-- 凭证标签关联表
CREATE TABLE IF NOT EXISTS credential_tags (
    credential_id TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    PRIMARY KEY (credential_id, tag_name),
    FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_credential_tags_tag ON credential_tags(tag_name);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY,
    color TEXT,
    use_count INTEGER DEFAULT 0
);

-- 剪贴板历史表
CREATE TABLE IF NOT EXISTS clipboard_history (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    content TEXT,
    image_data TEXT,
    file_path TEXT,
    preview TEXT NOT NULL,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL,
    source_app TEXT,
    is_pinned INTEGER DEFAULT 0,
    is_snippet INTEGER DEFAULT 0,
    snippet_name TEXT,
    snippet_shortcut TEXT,
    detected_key_type TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    use_count INTEGER DEFAULT 0,
    pinned_at INTEGER,
    image_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_history(hash);
CREATE INDEX IF NOT EXISTS idx_clipboard_type ON clipboard_history(type);
CREATE INDEX IF NOT EXISTS idx_clipboard_pinned ON clipboard_history(is_pinned);
CREATE INDEX IF NOT EXISTS idx_clipboard_snippet ON clipboard_history(is_snippet);
CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard_history(created_at DESC);

-- 剪贴板标签关联表
CREATE TABLE IF NOT EXISTS clipboard_tags (
    clipboard_id TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    PRIMARY KEY (clipboard_id, tag_name),
    FOREIGN KEY (clipboard_id) REFERENCES clipboard_history(id) ON DELETE CASCADE
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Vault 元数据表
CREATE TABLE IF NOT EXISTS vault_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    salt BLOB NOT NULL,
    iv BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    encrypted_dek BLOB NOT NULL,
    kdf_params TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'password',
    created_at INTEGER NOT NULL
);
