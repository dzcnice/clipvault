-- Runtime source: definitions.ts / migration024. Kept alongside historical SQL migrations.
ALTER TABLE clipboard_history ADD COLUMN last_copied_at INTEGER;
ALTER TABLE clipboard_history ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clipboard_history ADD COLUMN first_seen_known INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clipboard_history ADD COLUMN is_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clipboard_history ADD COLUMN saved_at INTEGER;
ALTER TABLE clipboard_history ADD COLUMN saved_from_id TEXT;
UPDATE clipboard_history SET last_copied_at = created_at;
CREATE TABLE clipboard_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clipboard_id TEXT NOT NULL REFERENCES clipboard_history(id) ON DELETE CASCADE,
  copied_at INTEGER NOT NULL,
  source_app TEXT,
  is_migration INTEGER NOT NULL DEFAULT 0
);
INSERT INTO clipboard_occurrences (clipboard_id, copied_at, source_app, is_migration)
SELECT id, created_at, source_app, 1 FROM clipboard_history WHERE is_snippet = 0;
CREATE INDEX idx_clip_occurrence_item ON clipboard_occurrences(clipboard_id, copied_at DESC);
CREATE INDEX idx_clip_occurrence_source ON clipboard_occurrences(source_app, clipboard_id);
CREATE INDEX idx_clip_recency ON clipboard_history(workspace, is_saved, is_pinned, last_copied_at DESC);
CREATE UNIQUE INDEX idx_clip_saved_source ON clipboard_history(saved_from_id) WHERE is_saved = 1;
