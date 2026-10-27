import type { MigrationDefinition } from './definitions'

export const harnessSessionMigration: MigrationDefinition = {
  version: 26,
  name: '026_session_events',
  sql: `
    CREATE TABLE wb_sessions (
      id TEXT PRIMARY KEY, project_id TEXT REFERENCES wb_projects(id),
      header TEXT NOT NULL, data TEXT NOT NULL, event_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE wb_session_events (
      session_id TEXT NOT NULL REFERENCES wb_sessions(id), seq INTEGER NOT NULL,
      event TEXT NOT NULL, PRIMARY KEY (session_id, seq)
    );
    CREATE TABLE wb_session_receipts (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES wb_sessions(id),
      operation TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `
}
