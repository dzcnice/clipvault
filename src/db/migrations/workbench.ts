import type { MigrationDefinition } from './definitions'

/** 新增结构，不重写旧凭据、剪贴板或其关联 ID。 */
export const workbenchMigration: MigrationDefinition = {
  version: 25,
  name: '025_workbench_projects_resources_tasks',
  sql: `
    CREATE TABLE wb_projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE wb_resources (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
      project_id TEXT REFERENCES wb_projects(id), environment TEXT NOT NULL,
      data TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'saved', version INTEGER NOT NULL,
      legacy_credential_id TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE wb_resource_fields (
      resource_id TEXT NOT NULL REFERENCES wb_resources(id), name TEXT NOT NULL,
      version INTEGER NOT NULL, secret INTEGER NOT NULL, value_encrypted TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY (resource_id, name, version)
    );
    CREATE TABLE wb_tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES wb_projects(id),
      data TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', active_run_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE wb_runs (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES wb_tasks(id), session_id TEXT NOT NULL,
      runtime_version TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER
    );
    CREATE TABLE wb_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES wb_runs(id),
      kind TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE wb_settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE wb_receipts (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES wb_runs(id), operation TEXT NOT NULL,
      fingerprint TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_wb_tasks_updated ON wb_tasks(updated_at DESC);
    CREATE INDEX idx_wb_resources_project ON wb_resources(project_id, environment, state);
    CREATE INDEX idx_wb_fields_version ON wb_resource_fields(resource_id, version DESC);
    CREATE INDEX idx_wb_events_run ON wb_events(run_id, id);
  `
}
