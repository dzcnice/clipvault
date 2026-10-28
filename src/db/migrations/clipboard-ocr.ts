import type { MigrationDefinition } from './definitions'
/** 剪贴板图片的本机 OCR 文字：加密保存，用于搜索与"复制识别文字"；不联网。 */
export const clipboardOcrMigration: MigrationDefinition = { version: 31, name: '031_clipboard_ocr', sql: `
  ALTER TABLE clipboard_history ADD COLUMN ocr_encrypted BLOB;
  ALTER TABLE clipboard_history ADD COLUMN ocr_nonce BLOB;
  ALTER TABLE clipboard_history ADD COLUMN ocr_state TEXT;
  CREATE INDEX idx_clipboard_ocr_pending ON clipboard_history(type, ocr_state, created_at);
` }
