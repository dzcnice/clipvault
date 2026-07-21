-- v2.0 Sprint 2 / TASK-012：团队成员（已配对设备）
--
-- 设备的长期 X25519 静态密钥对存于 team_self_keys（id=1 单行），
-- 已配对成员的公钥 + 共享对称密钥存 team_members；
-- shared_key_encrypted 用 vault DEK (AES-256-GCM) 加密，绝不存明文。

CREATE TABLE IF NOT EXISTS team_self_keys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  device_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  -- 私钥用 vault DEK 加密（AES-256-GCM），格式 "iv:authTag:cipher" base64
  static_priv_encrypted TEXT NOT NULL,
  -- 公钥（base64url，可公开）
  static_pub TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar TEXT,
  -- 对端 X25519 公钥（base64url）
  public_key TEXT NOT NULL,
  -- 团队共享密钥（每对一份，AES-256-GCM 加密后的 base64 三段）
  shared_key_encrypted TEXT NOT NULL,
  paired_at INTEGER NOT NULL,
  last_seen INTEGER,
  role TEXT NOT NULL DEFAULT 'member',
  -- 软删除时间戳，未删除为 NULL
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_team_members_device ON team_members(device_id);
CREATE INDEX IF NOT EXISTS idx_team_members_deleted ON team_members(deleted_at);
