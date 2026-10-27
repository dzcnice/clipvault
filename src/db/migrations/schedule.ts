import type { MigrationDefinition } from './definitions'
/** Reminders created by the official schedule tools; record, deliveries and history are encrypted. */
export const scheduleMigration: MigrationDefinition = { version: 30, name: '030_schedules', sql: `
  CREATE TABLE wb_schedules (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES wb_sessions(id),
    status TEXT NOT NULL DEFAULT 'active', next_at INTEGER, data TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_wb_schedules_due ON wb_schedules(status, next_at);
  CREATE INDEX idx_wb_schedules_session ON wb_schedules(session_id, created_at);
` }
