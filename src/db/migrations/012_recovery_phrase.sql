-- 012 BIP39 恢复短语（Sprint 13 · TASK-071）
-- 仅保存 scrypt(mnemonic) 哈希；明文 24 词绝不落库
CREATE TABLE IF NOT EXISTS recovery_phrase (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hash BLOB NOT NULL,
  salt BLOB NOT NULL,
  kdf_params TEXT NOT NULL,       -- JSON: {N,r,p,keyLen}
  created_at INTEGER NOT NULL,
  last_verified_at INTEGER
);
