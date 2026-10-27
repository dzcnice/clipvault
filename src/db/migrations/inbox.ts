import type { MigrationDefinition } from './definitions'
export const inboxMigration: MigrationDefinition = { version: 29, name: '029_inbox', sql: `
  CREATE TABLE wb_inbox (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, source_id TEXT, project_id TEXT, data TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_wb_inbox_state ON wb_inbox(state, created_at DESC);
  CREATE INDEX idx_wb_inbox_source ON wb_inbox(source_id, created_at DESC);
` }
