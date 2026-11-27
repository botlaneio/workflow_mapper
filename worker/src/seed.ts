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
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id FROM orgs WHERE id = ?").bind(BOTLANE_ORG.id).first();
  if (existing) return;

  const statements = [
    env.DB.prepare("INSERT INTO orgs (id, name, config_json, created_at) VALUES (?, ?, ?, ?)").bind(
      BOTLANE_ORG.id,
      BOTLANE_ORG.name,
      JSON.stringify(BOTLANE_ORG),
      now,
    ),
    env.DB.prepare("INSERT INTO users (id, org_id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
      "user_admin",
      BOTLANE_ORG.id,
      "admin@botlane.io",
      "Solo",
      "admin",
      now,
    ),
    env.DB.prepare("INSERT INTO users (id, org_id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
      "user_sales",
      BOTLANE_ORG.id,
      "sales@botlane.io",
      "Sales",
      "presenter",
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
