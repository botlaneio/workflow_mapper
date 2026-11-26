export interface Env {
  DB: D1Database;
  SESSION_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  AUTH_MODE: string;
  AUTH_SECRET?: string;
  DEV_LOGIN_PASSWORD?: string;
  PUBLIC_ORIGIN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface UserRow {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: "admin" | "presenter";
}

export interface SessionRow {
  id: string;
  org_id: string;
  code: string;
  token_hash: string;
  join_token: string;
  expires_at: string;
  industry: string;
  owner_id: string;
  template_id: string | null;
  company: string;
  process_name: string;
  status: "live" | "completed" | "archived";
  link_enabled: number;
  created_at: string;
  updated_at: string;
  owner_name?: string;
}
