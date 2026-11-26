export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, email)
)`,
  `CREATE TABLE IF NOT EXISTS process_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  industry TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  run_unit TEXT NOT NULL,
  icon TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  sample INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS catalogs (
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (org_id, kind)
)`,
  `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  code TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  join_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  industry TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  template_id TEXT,
  company TEXT NOT NULL DEFAULT '',
  process_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  link_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_org_code ON sessions (org_id, code)`,
  `CREATE INDEX IF NOT EXISTS sessions_org_updated ON sessions (org_id, updated_at)`,
];
