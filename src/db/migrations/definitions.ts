/**
 * Migration definitions（TS 字符串形式，便于主进程 bundle & 单测）
 *
 * 每个条目的 sql 内容与同目录下对应 .sql 文件保持一致，
 * .sql 文件用于评审 / 文档，运行时只读 definitions.ts。
 *
 * 约定：version 单调递增，且与 connection.ts 中的 PRAGMA user_version 挂钩。
 */

export interface MigrationDefinition {
  /** 目标版本号（整数，严格单调递增） */
  version: number
  /** 语义化名字（用于日志） */
  name: string
  /** SQL 语句（单条或多条，支持用分号分隔） */
  sql: string
  /**
   * 是否允许在同一事务中执行。
   * 默认 true；某些 PRAGMA / ALTER 语句 SQLite 限制时置为 false。
   */
  transactional?: boolean
}

/** 1. v1.0 完整 schema（对应 001_initial.sql） */
const migration001: MigrationDefinition = {
  version: 1,
  name: 'initial',
  sql: `
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
  `
}

/** 2. shortcuts 自定义表（TASK-007 衍生） */
const migration002: MigrationDefinition = {
  version: 2,
  name: 'shortcuts',
  sql: `
    CREATE TABLE IF NOT EXISTS shortcuts (
      command_id TEXT PRIMARY KEY,
      accelerator TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shortcuts_is_default ON shortcuts(is_default);
  `
}

/** 3. 主题偏好写入默认 (TASK-003) */
const migration003: MigrationDefinition = {
  version: 3,
  name: 'theme_setting',
  sql: `
    INSERT OR IGNORE INTO settings (key, value, updated_at)
    VALUES ('theme.mode', 'system', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
  `
}

/** 4. 团队成员 + 自身长期密钥（v2.0 Sprint 2 / TASK-012） */
const migration004: MigrationDefinition = {
  version: 4,
  name: '004_team_members',
  sql: `
    CREATE TABLE IF NOT EXISTS team_self_keys (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      device_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      static_priv_encrypted TEXT NOT NULL,
      static_pub TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar TEXT,
      public_key TEXT NOT NULL,
      shared_key_encrypted TEXT NOT NULL,
      paired_at INTEGER NOT NULL,
      last_seen INTEGER,
      role TEXT NOT NULL DEFAULT 'member',
      deleted_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_device ON team_members(device_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_deleted ON team_members(deleted_at);
  `
}

/** 5. 团队剪贴板镜像（v2.0 Sprint 3 / TASK-017） */
const migration005: MigrationDefinition = {
  version: 5,
  name: '005_shared_clipboard',
  sql: `
    CREATE TABLE IF NOT EXISTS shared_clipboard (
      id TEXT PRIMARY KEY,
      shared_by_member_id TEXT NOT NULL,
      shared_at INTEGER NOT NULL,
      shared_via TEXT NOT NULL DEFAULT 'manual',
      category TEXT NOT NULL DEFAULT 'other',
      tags_json TEXT,
      content_encrypted TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      pinned INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      deleted_at INTEGER,
      FOREIGN KEY (shared_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_shared_at ON shared_clipboard(shared_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_pinned ON shared_clipboard(pinned);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_expires ON shared_clipboard(expires_at);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_member ON shared_clipboard(shared_by_member_id);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_deleted ON shared_clipboard(deleted_at);
  `
}

/** 6. 团队凭证（v2.0 Sprint 4 / TASK-021，Sprint 3 内提前建表为引用机制铺路） */
const migration006: MigrationDefinition = {
  version: 6,
  name: '006_shared_credentials',
  sql: `
    CREATE TABLE IF NOT EXISTS shared_credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      value_encrypted TEXT NOT NULL,
      description TEXT,
      tags_json TEXT,
      created_by_member_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      FOREIGN KEY (created_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shared_credentials_name ON shared_credentials(name);
    CREATE INDEX IF NOT EXISTS idx_shared_credentials_type ON shared_credentials(type);
    CREATE INDEX IF NOT EXISTS idx_shared_credentials_creator ON shared_credentials(created_by_member_id);
    CREATE INDEX IF NOT EXISTS idx_shared_credentials_deleted ON shared_credentials(deleted_at);
  `
}

/** 7. AI 设置（v2.0 Sprint 8 · TASK-046）—— Vera 单例配置 */
const migration007: MigrationDefinition = {
  version: 7,
  name: '007_ai_settings',
  sql: `
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT NOT NULL DEFAULT 'deepseek',
      api_key_encrypted BLOB,
      base_url TEXT DEFAULT 'https://api.deepseek.com/v1',
      model TEXT DEFAULT 'deepseek-chat',
      local_fallback_enabled INTEGER DEFAULT 0,
      monthly_budget_cents INTEGER DEFAULT 1000,
      updated_at INTEGER
    );
  `
}

/** 8. AI 审计日志（v2.0 Sprint 8 · TASK-041 / S10 预埋） */
const migration008: MigrationDefinition = {
  version: 8,
  name: '008_ai_audit_log',
  sql: `
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
  `
}

/** 9. Vera 自动化操作历史（v2.0 Sprint 9.1 · 预埋 TASK-051） */
const migration009: MigrationDefinition = {
  version: 9,
  name: '009_vera_operation_history',
  sql: `
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
  `
}

/** 10. 生物识别 DEK 信封（Sprint 13 · TASK-067） */
const migration010: MigrationDefinition = {
  version: 10,
  name: '010_biometric',
  sql: `
    CREATE TABLE IF NOT EXISTS biometric_enrollment (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mechanism TEXT NOT NULL,
      encrypted_dek BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0
    );
  `
}

/** 11. 凭证使用审计（Sprint 13 · TASK-070） */
const migration011: MigrationDefinition = {
  version: 11,
  name: '011_credential_audit',
  sql: `
    CREATE TABLE IF NOT EXISTS credential_audit (
      id TEXT PRIMARY KEY,
      credential_id TEXT NOT NULL,
      credential_name TEXT,
      actor TEXT NOT NULL DEFAULT 'local-user',
      action TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_credential_audit_credential ON credential_audit(credential_id);
    CREATE INDEX IF NOT EXISTS idx_credential_audit_timestamp ON credential_audit(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_credential_audit_action ON credential_audit(action);
  `
}

/** 12. BIP39 恢复短语哈希（Sprint 13 · TASK-071） */
const migration012: MigrationDefinition = {
  version: 12,
  name: '012_recovery_phrase',
  sql: `
    CREATE TABLE IF NOT EXISTS recovery_phrase (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hash BLOB NOT NULL,
      salt BLOB NOT NULL,
      kdf_params TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_verified_at INTEGER
    );
  `
}

/** 13. 凭证 TOTP 表（Sprint 11 · TASK-057） */
const migration013: MigrationDefinition = {
  version: 13,
  name: '013_credential_totp',
  sql: `
    CREATE TABLE IF NOT EXISTS credential_totp (
      credential_id TEXT PRIMARY KEY,
      secret_encrypted TEXT NOT NULL,
      issuer TEXT,
      account TEXT,
      algorithm TEXT NOT NULL DEFAULT 'SHA1',
      digits INTEGER NOT NULL DEFAULT 6,
      period INTEGER NOT NULL DEFAULT 30,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_credential_totp_updated ON credential_totp(updated_at DESC);
  `
}

/** 14. SSH Key 代管（Sprint 12 · TASK-064） */
const migration014: MigrationDefinition = {
  version: 14,
  name: '014_ssh_keys',
  sql: `
    CREATE TABLE IF NOT EXISTS ssh_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      public_key TEXT NOT NULL,
      private_key_encrypted BLOB NOT NULL,
      comment TEXT,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_ssh_keys_created ON ssh_keys(created_at DESC);
  `
}

/** 15. HTTP API Token（Sprint 12 · TASK-065） */
const migration015: MigrationDefinition = {
  version: 15,
  name: '015_http_api_tokens',
  sql: `
    CREATE TABLE IF NOT EXISTS http_api_tokens (
      id TEXT PRIMARY KEY,
      token_hash BLOB NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      enabled INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_http_tokens_enabled ON http_api_tokens(enabled);
  `
}

/** 16. Webhook 订阅（Sprint 14 · TASK-076） */
const migration016: MigrationDefinition = {
  version: 16,
  name: '016_webhooks',
  sql: `
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      platform TEXT NOT NULL,
      subscribed_events TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      failure_count INTEGER DEFAULT 0,
      last_triggered_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
    CREATE INDEX IF NOT EXISTS idx_webhooks_platform ON webhooks(platform);
  `
}

/** 17. v2.1 · team_info 单团队元数据（Batch 1） */
const migration017: MigrationDefinition = {
  version: 17,
  name: '017_team_info',
  sql: `
    CREATE TABLE IF NOT EXISTS team_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT '我的团队',
      icon_emoji TEXT DEFAULT '👥',
      accent_color TEXT DEFAULT '#7c3aed',
      owner_device_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- 兼容升级：已有团队成员但未登记 team_info，自动补一条默认行
    INSERT OR IGNORE INTO team_info (id, name, owner_device_id, created_at)
    SELECT 1, '我的团队',
           COALESCE((SELECT device_id FROM team_self_keys LIMIT 1), ''),
           CAST(strftime('%s', 'now') AS INTEGER) * 1000
    WHERE EXISTS (SELECT 1 FROM team_members LIMIT 1);
  `
}

/**
 * 18. v2.1 · workspace 双轨字段（Batch 1）
 *
 * ALTER TABLE ADD COLUMN 非幂等，依赖 runMigrations 对非事务语句的 tolerantExec
 * 容错处理（index.ts 会捕获 "duplicate column name" 错误）。
 * 因此本条 migration 必须 transactional=false，把 ALTER 拆成"一条一 exec"，
 * 每条单独吞 duplicate column 错误；CREATE INDEX / UPDATE 仍然能跑到。
 */
const migration018: MigrationDefinition = {
  version: 18,
  name: '018_workspace_fields',
  transactional: false,
  sql: `
    ALTER TABLE credentials        ADD COLUMN workspace TEXT DEFAULT 'personal';
    ALTER TABLE clipboard_history  ADD COLUMN workspace TEXT DEFAULT 'personal';

    CREATE INDEX IF NOT EXISTS idx_cred_workspace ON credentials(workspace);
    CREATE INDEX IF NOT EXISTS idx_clip_workspace ON clipboard_history(workspace);

    UPDATE credentials       SET workspace = 'personal' WHERE workspace IS NULL;
    UPDATE clipboard_history SET workspace = 'personal' WHERE workspace IS NULL;
  `
}

/**
 * 19. v2.1 · self identity 扩展（头像 + 签名）（Batch 1）
 *
 * 注意：实际表名为 team_self_keys（见 004_team_members.sql），
 * 任务书中称作 self_identity 仅为语义别名。
 * ALTER TABLE ADD COLUMN 非幂等，transactional=false + tolerantExec。
 */
const migration019: MigrationDefinition = {
  version: 19,
  name: '019_self_identity_extend',
  transactional: false,
  sql: `
    ALTER TABLE team_self_keys ADD COLUMN avatar_blob BLOB;
    ALTER TABLE team_self_keys ADD COLUMN signature  TEXT DEFAULT '';
  `
}

/** 20. v2.1 · file_transfers 文件传输记录（Batch 1，为 2C 铺路） */
const migration020: MigrationDefinition = {
  version: 20,
  name: '020_file_transfers',
  sql: `
    CREATE TABLE IF NOT EXISTS file_transfers (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      peer_device_id TEXT NOT NULL,
      peer_display_name TEXT,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash TEXT,
      mime_type TEXT,
      status TEXT NOT NULL,
      bytes_transferred INTEGER DEFAULT 0,
      local_path TEXT,
      error_message TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_file_transfers_status ON file_transfers(status);
    CREATE INDEX IF NOT EXISTS idx_file_transfers_peer   ON file_transfers(peer_device_id, started_at);
  `
}

/**
 * 21. v2.1 · C1 · clipboard_history 内容加密列
 *
 * 为"剪贴板内容纳入加密口径"任务引入密文列 + legacy 标记。
 * ALTER TABLE ADD COLUMN 非幂等，必须 transactional=false + tolerantExec。
 * 运行时回填由 vault 解锁后触发的 backfillClipboardEncryption() 完成。
 */
const migration021: MigrationDefinition = {
  version: 21,
  name: '021_clipboard_encryption',
  transactional: false,
  sql: `
    ALTER TABLE clipboard_history ADD COLUMN content_encrypted BLOB;
    ALTER TABLE clipboard_history ADD COLUMN content_nonce     BLOB;
    ALTER TABLE clipboard_history ADD COLUMN preview_encrypted BLOB;
    ALTER TABLE clipboard_history ADD COLUMN preview_nonce     BLOB;
    ALTER TABLE clipboard_history ADD COLUMN content_plaintext_legacy INTEGER NOT NULL DEFAULT 1;

    CREATE INDEX IF NOT EXISTS idx_clipboard_legacy ON clipboard_history(content_plaintext_legacy);
  `
}

/**
 * 22. v2.1 · P0-2 · sync_outbox 双写一致性
 *
 * SQLite + Y.Doc 双写中任一路失败会产生 drift。outbox 行先落盘，
 * 再由 replayer 在启动与定时扫描中补齐两路状态，直至两路 applied 为止。
 */
const migration022: MigrationDefinition = {
  version: 22,
  name: '022_sync_outbox',
  sql: `
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      op TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      sqlite_applied INTEGER NOT NULL DEFAULT 0,
      ydoc_applied INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_attempt_at INTEGER,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox(ydoc_applied, sqlite_applied);
    CREATE INDEX IF NOT EXISTS idx_outbox_entity ON sync_outbox(kind, entity_id);
  `
}

/**
 * v23 · 修复 shared_clipboard.shared_by_member_id NOT NULL
 * （owner 自己不在 team_members 表里，pushToTeam 必须能写 NULL）
 */
const migration023: MigrationDefinition = {
  version: 23,
  name: '023_shared_clipboard_nullable_member',
  transactional: false,
  sql: `
    PRAGMA foreign_keys = OFF;

    CREATE TABLE shared_clipboard__new (
      id TEXT PRIMARY KEY,
      shared_by_member_id TEXT,
      shared_at INTEGER NOT NULL,
      shared_via TEXT NOT NULL DEFAULT 'manual',
      category TEXT NOT NULL DEFAULT 'other',
      tags_json TEXT,
      content_encrypted TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      pinned INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      deleted_at INTEGER,
      FOREIGN KEY (shared_by_member_id) REFERENCES team_members(id) ON DELETE SET NULL
    );

    INSERT INTO shared_clipboard__new
      (id, shared_by_member_id, shared_at, shared_via, category, tags_json,
       content_encrypted, content_type, pinned, expires_at, deleted_at)
    SELECT
      id, shared_by_member_id, shared_at, shared_via, category, tags_json,
      content_encrypted, content_type, pinned, expires_at, deleted_at
    FROM shared_clipboard;

    DROP TABLE shared_clipboard;
    ALTER TABLE shared_clipboard__new RENAME TO shared_clipboard;

    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_shared_at ON shared_clipboard(shared_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_pinned ON shared_clipboard(pinned);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_expires ON shared_clipboard(expires_at);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_member ON shared_clipboard(shared_by_member_id);
    CREATE INDEX IF NOT EXISTS idx_shared_clipboard_deleted ON shared_clipboard(deleted_at);

    PRAGMA foreign_keys = ON;
  `
}

/**
 * 所有 migration，按 version 升序。
 * 新增 migration 时请保证 version 单调 +1 并 append 到末尾。
 */
export const MIGRATIONS: readonly MigrationDefinition[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
  migration021,
  migration022,
  migration023
]
