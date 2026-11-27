import { BOTLANE_CATALOG, BOTLANE_ORG } from "../../shared/src/catalog";
import { MANUFACTURING_TEMPLATES } from "../../shared/src/seed-data";
import type { Env } from "./env";
import { SCHEMA_STATEMENTS } from "./schema";

let ready: Promise<void> | null = null;

export function ensureReady(env: Env): Promise<void> {
  if (!ready) {
    ready = seed(env).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function seed(env: Env): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await env.DB.prepare(statement).run();
  }
  await ensureSessionColumns(env);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id FROM orgs WHERE id = ?").bind(BOTLANE_ORG.id).first();
  if (!existing) {
    await insertLibrary(env, now);
  } else {
    await env.DB.prepare("UPDATE orgs SET name = ?, config_json = ? WHERE id = ?")
      .bind(BOTLANE_ORG.name, JSON.stringify(BOTLANE_ORG), BOTLANE_ORG.id)
      .run();
  }
  await syncTeam(env, now);
}

async function ensureSessionColumns(env: Env): Promise<void> {
  const info = await env.DB.prepare("PRAGMA table_info(sessions)").all<{ name: string }>();
  const names = new Set((info.results ?? []).map((column) => column.name));
  if (!names.has("summary_token")) await env.DB.prepare("ALTER TABLE sessions ADD COLUMN summary_token TEXT").run();
  if (!names.has("summary_enabled")) await env.DB.prepare("ALTER TABLE sessions ADD COLUMN summary_enabled INTEGER NOT NULL DEFAULT 1").run();
}

async function syncTeam(env: Env, now: string): Promise<void> {
  const allowed = new Set(BOTLANE_ORG.team.map((member) => member.email.toLowerCase()));
  for (const member of BOTLANE_ORG.team) {
    await env.DB.prepare(
      `INSERT INTO users (id, org_id, email, name, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id, email) DO UPDATE SET name = excluded.name, role = excluded.role`,
    )
      .bind(member.id, BOTLANE_ORG.id, member.email.toLowerCase(), member.name, member.role, now)
      .run();
  }
  const rows = await env.DB.prepare("SELECT email FROM users WHERE org_id = ?").bind(BOTLANE_ORG.id).all<{ email: string }>();
  for (const row of rows.results ?? []) {
    if (!allowed.has(row.email.toLowerCase())) {
      await env.DB.prepare("DELETE FROM users WHERE org_id = ? AND email = ?").bind(BOTLANE_ORG.id, row.email).run();
    }
  }
}

async function insertLibrary(env: Env, now: string): Promise<void> {
  const statements = [
    env.DB.prepare("INSERT INTO orgs (id, name, config_json, created_at) VALUES (?, ?, ?, ?)").bind(
      BOTLANE_ORG.id,
      BOTLANE_ORG.name,
      JSON.stringify(BOTLANE_ORG),
      now,
    ),
    env.DB.prepare("INSERT INTO catalogs (org_id, kind, data_json) VALUES (?, 'full', ?)").bind(
      BOTLANE_ORG.id,
      JSON.stringify(BOTLANE_CATALOG),
    ),
  ];

  for (const template of MANUFACTURING_TEMPLATES) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO process_templates
          (id, org_id, industry, name, description, run_unit, icon, data_json, status, version, sample, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 1, ?, ?)`,
      ).bind(
        template.id,
        BOTLANE_ORG.id,
        template.industry,
        template.name,
        template.description,
        template.runUnit,
        template.icon,
        JSON.stringify({
          roles: template.roles,
          steps: template.steps,
          questions: template.questions,
          areas: template.areas,
        }),
        now,
        now,
      ),
    );
  }

  await env.DB.batch(statements);
}
