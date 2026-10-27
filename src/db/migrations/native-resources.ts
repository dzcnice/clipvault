import type { MigrationDefinition } from './definitions'

// 027 is installed before 028 to keep migration ordering stable; the classifier is enabled in P2.
export const clipboardCategoryMigration: MigrationDefinition = { version: 27, name: '027_clipboard_categories', sql: `
  ALTER TABLE clipboard_history ADD COLUMN category TEXT;
  ALTER TABLE clipboard_history ADD COLUMN project_id TEXT;
  ALTER TABLE clipboard_history ADD COLUMN ai_meta TEXT;
  CREATE INDEX idx_clip_category_recent ON clipboard_history(category, last_copied_at DESC);
  CREATE TABLE wb_session_clipboard_refs (
    session_id TEXT NOT NULL REFERENCES wb_sessions(id), clipboard_id TEXT NOT NULL REFERENCES clipboard_history(id) ON DELETE CASCADE,
    PRIMARY KEY(session_id,clipboard_id)
  );
` }
export const resourceRolesMigration: MigrationDefinition = { version: 28, name: '028_resource_roles_usage', sql: `
  ALTER TABLE wb_resource_fields ADD COLUMN role TEXT NOT NULL DEFAULT 'other';
  ALTER TABLE wb_resources ADD COLUMN last_used_at INTEGER;
  CREATE TABLE wb_resource_secret_index (
    resource_id TEXT NOT NULL REFERENCES wb_resources(id), field TEXT NOT NULL,
    mac TEXT NOT NULL, PRIMARY KEY(resource_id,field)
  );
  CREATE INDEX idx_wb_secret_mac ON wb_resource_secret_index(mac);
` }
