ALTER TABLE sessions ADD COLUMN summary_token TEXT;
ALTER TABLE sessions ADD COLUMN summary_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS template_proposals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  session_id TEXT,
  source_template_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  run_unit TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
