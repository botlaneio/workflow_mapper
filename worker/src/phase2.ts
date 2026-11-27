import type { Context, Hono } from "hono";
import { clientSummaryText, type ClientSummary } from "../../shared/src/client-summary";
import { hmacSign, secretToken } from "../../shared/src/bytes";
import { BOTLANE_ORG, publicOrg } from "../../shared/src/catalog";
import type { OrgConfig } from "../../shared/src/types";
import type { Env, SessionRow, UserRow } from "./env";
import { crmAdapter, crmPushFromSummary } from "./crm";
import { textPdf } from "./pdf";
import { renderSummaryHtml } from "./summary-html";

type App = Hono<{ Bindings: Env; Variables: { user: UserRow } }>;

export function registerPhase2(app: App): void {
  app.get("/api/summary/:token", async (c) => {
    const loaded = await loadPublicSummary(c.env, c.req.param("token"), new URL(c.req.url).origin);
    if (!loaded) return c.json({ error: "This summary link is not valid or has expired." }, 404);
    return c.json(loaded.summary, 200, { "cache-control": "no-store", "referrer-policy": "no-referrer" });
  });

  app.get("/api/summary/:token/html", async (c) => {
    const loaded = await loadPublicSummary(c.env, c.req.param("token"), new URL(c.req.url).origin);
    if (!loaded) return c.text("This summary link is not valid or has expired.", 404);
    const org = publicOrg(await loadOrg(c.env));
    return c.html(renderSummaryHtml(loaded.summary, org, loaded.expiresAt), 200, {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
  });

  app.get("/api/summary/:token/pdf", async (c) => {
    const loaded = await loadPublicSummary(c.env, c.req.param("token"), new URL(c.req.url).origin);
    if (!loaded) return c.text("This summary link is not valid or has expired.", 404);
    const pdf = textPdf(loaded.summary.company || "Workflow map", clientSummaryText(loaded.summary, loaded.summaryUrl));
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="workflow-map.pdf"`,
        "cache-control": "no-store",
      },
    });
  });

  app.post("/api/presenter/sessions/:id/summary", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
    const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({ enabled: true }));
    const user = c.get("user");
    const row = await ownedSession(c.env, c.req.param("id"), user.org_id);
    if (!row) return c.json({ error: "Session not found" }, 404);
    const enabled = body.enabled === false ? 0 : 1;
    await c.env.DB.prepare("UPDATE sessions SET summary_enabled = ?, updated_at = ? WHERE id = ?").bind(enabled, new Date().toISOString(), row.id).run();
    return c.json({ ok: true, summaryEnabled: enabled === 1 });
  });

  app.post("/api/presenter/sessions/:id/crm", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
    const user = c.get("user");
    const row = await ownedSession(c.env, c.req.param("id"), user.org_id);
    if (!row) return c.json({ error: "Session not found" }, 404);
    const token = await ensureSummaryToken(c.env, row);
    const origin = new URL(c.req.url).origin;
    const summaryUrl = `${origin}/s/${token}`;
    if (!c.env.CRM_API_KEY) {
      const summary = await exportSummary(c.env, row.id);
      if (!summary) return c.json({ error: "The map is not ready to send" }, 409);
      const push = crmPushFromSummary({
        company: summary.company,
        contact: summary.contact,
        contactRole: summary.contactRole,
        city: summary.city,
        processName: summary.processName,
        summaryText: clientSummaryText(summary),
        summaryUrl,
      });
      const result = await crmAdapter(c.env.CRM_ADAPTER).push(push);
      return c.json({
        ok: true,
        adapter: result.adapter,
        reference: result.reference,
        message: result.adapter === "noop"
          ? "CRM is not connected. Nothing was sent. The note is ready for the real adapter."
          : "Recorded in the local mock adapter. Nothing was sent to Comp AI.",
      });
    }
    if (!c.env.AUTH_SECRET) return c.json({ ok: false, message: "Not sent to CRM" });
    const org = await loadOrg(c.env);
    const baseUrl = typeof org.crmBaseUrl === "string" && org.crmBaseUrl
      ? org.crmBaseUrl
      : "https://ops-api.botlane.io/rest";
    const stamp = await hmacSign(`crm.${row.id}`, c.env.AUTH_SECRET);
    const stub = c.env.SESSION_ROOM.get(c.env.SESSION_ROOM.idFromName(row.id));
    const response = await stub.fetch(new Request("https://session/crm", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wm-crm": stamp },
      body: JSON.stringify({ sessionId: row.id, summaryUrl, baseUrl }),
    }));
    const payload = await response.json().catch(() => ({ ok: false, message: "Not sent to CRM" })) as { ok?: boolean; message?: string };
    return c.json({
      ok: payload.ok === true,
      message: payload.message || "Not sent to CRM",
    });
  });

  app.post("/api/presenter/sessions/:id/proposals", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
    const user = c.get("user");
    const row = await ownedSession(c.env, c.req.param("id"), user.org_id);
    if (!row) return c.json({ error: "Session not found" }, 404);
    const body = await c.req.json<{ kind?: string }>().catch(() => ({ kind: "new" }));
    const kind = body.kind === "improvement" ? "improvement" : "new";
    const exported = await exportBundle(c.env, row.id);
    if (!exported) return c.json({ error: "The map is not ready" }, 409);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO template_proposals
        (id, org_id, session_id, source_template_id, kind, name, description, run_unit, data_json, status, submitted_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).bind(
      id,
      user.org_id,
      row.id,
      kind === "improvement" ? row.template_id : null,
      kind,
      exported.draft.name,
      exported.draft.description,
      exported.draft.runUnit,
      JSON.stringify({ roles: exported.draft.roles, steps: exported.draft.steps, questions: exported.draft.questions, areas: [] }),
      user.id,
      now,
      now,
    ).run();
    return c.json({ ok: true, id, status: "pending" });
  });

  app.get("/api/presenter/library", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const user = c.get("user");
    const templates = await c.env.DB.prepare("SELECT * FROM process_templates WHERE org_id = ? ORDER BY status, name").bind(user.org_id).all();
    const proposals = await c.env.DB.prepare("SELECT * FROM template_proposals WHERE org_id = ? ORDER BY created_at DESC").bind(user.org_id).all();
    return c.json({ templates: templates.results ?? [], proposals: proposals.results ?? [] });
  });

  app.post("/api/presenter/library", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
    const denied = adminOnly(c);
    if (denied) return denied;
    const user = c.get("user");
    const body = await readTemplateBody(c);
    if (!body.name) return c.json({ error: "Name is required" }, 400);
    const now = new Date().toISOString();
    const id = `tpl-${crypto.randomUUID().slice(0, 8)}`;
    await insertTemplate(c.env, { id, orgId: user.org_id, ...body, status: "active", version: 1, now });
    return c.json({ ok: true, id });
  });

  app.put("/api/presenter/library/:id", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
    const denied = adminOnly(c);
    if (denied) return denied;
    const user = c.get("user");
    const current = await c.env.DB.prepare("SELECT * FROM process_templates WHERE id = ? AND org_id = ?").bind(c.req.param("id"), user.org_id).first<{ version: number }>();
    if (!current) return c.json({ error: "Template not found" }, 404);
    const body = await readTemplateBody(c);
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE process_templates SET name = ?, description = ?, run_unit = ?, data_json = ?, version = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
    ).bind(body.name, body.description, body.runUnit, JSON.stringify({ roles: body.roles, steps: body.steps, questions: body.questions, areas: body.areas }), current.version + 1, now, c.req.param("id"), user.org_id).run();
    return c.json({ ok: true });
  });

  app.post("/api/presenter/library/:id/archive", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
    const denied = adminOnly(c);
    if (denied) return denied;
    const user = c.get("user");
    await c.env.DB.prepare("UPDATE process_templates SET status = 'archived', updated_at = ? WHERE id = ? AND org_id = ?").bind(new Date().toISOString(), c.req.param("id"), user.org_id).run();
    return c.json({ ok: true });
  });

  app.post("/api/presenter/library/proposals/:id", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
    const denied = adminOnly(c);
    if (denied) return denied;
    const user = c.get("user");
    const body = await c.req.json<{ decision?: string }>().catch(() => ({ decision: "" }));
    const proposal = await c.env.DB.prepare("SELECT * FROM template_proposals WHERE id = ? AND org_id = ?").bind(c.req.param("id"), user.org_id).first<ProposalRow>();
    if (!proposal || proposal.status !== "pending") return c.json({ error: "Proposal not found" }, 404);
    const now = new Date().toISOString();
    if (body.decision === "reject") {
      await c.env.DB.prepare("UPDATE template_proposals SET status = 'rejected', reviewed_by = ?, updated_at = ? WHERE id = ?").bind(user.id, now, proposal.id).run();
      return c.json({ ok: true, status: "rejected" });
    }
    if (body.decision !== "approve") return c.json({ error: "Choose approve or reject" }, 400);
    const data = JSON.parse(proposal.data_json) as TemplateBody;
    if (proposal.kind === "improvement" && proposal.source_template_id) {
      const current = await c.env.DB.prepare("SELECT version FROM process_templates WHERE id = ? AND org_id = ?").bind(proposal.source_template_id, user.org_id).first<{ version: number }>();
      if (current) {
        await c.env.DB.prepare(
          `UPDATE process_templates SET name = ?, description = ?, run_unit = ?, data_json = ?, version = ?, status = 'active', updated_at = ? WHERE id = ?`,
        ).bind(proposal.name, proposal.description, proposal.run_unit, proposal.data_json, current.version + 1, now, proposal.source_template_id).run();
      }
    } else {
      await insertTemplate(c.env, {
        id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
        orgId: user.org_id,
        name: proposal.name,
        description: proposal.description,
        runUnit: proposal.run_unit,
        roles: data.roles ?? [],
        steps: data.steps ?? [],
        questions: data.questions ?? [],
        areas: data.areas ?? [],
        status: "active",
        version: 1,
        now,
      });
    }
    await c.env.DB.prepare("UPDATE template_proposals SET status = 'approved', reviewed_by = ?, updated_at = ? WHERE id = ?").bind(user.id, now, proposal.id).run();
    return c.json({ ok: true, status: "approved" });
  });
}

async function loadPublicSummary(env: Env, token: string, origin: string): Promise<{ summary: ClientSummary; expiresAt: string; summaryUrl: string } | null> {
  if (!token || token.length < 20) return null;
  const row = await env.DB.prepare("SELECT * FROM sessions WHERE summary_token = ?").bind(token).first<SessionRow>();
  if (!row || row.summary_enabled === 0) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  const summary = await exportSummary(env, row.id);
  if (!summary) return null;
  return { summary, expiresAt: row.expires_at, summaryUrl: `${origin}/s/${token}` };
}

async function exportSummary(env: Env, sessionId: string): Promise<ClientSummary | null> {
  const bundle = await exportBundle(env, sessionId);
  return bundle?.summary ?? null;
}

async function exportBundle(env: Env, sessionId: string): Promise<{ summary: ClientSummary; draft: Draft } | null> {
  if (!env.AUTH_SECRET) return null;
  const stamp = await hmacSign(`export.${sessionId}`, env.AUTH_SECRET);
  const stub = env.SESSION_ROOM.get(env.SESSION_ROOM.idFromName(sessionId));
  const response = await stub.fetch(new Request("https://session/export", {
    method: "POST",
    headers: { "content-type": "application/json", "x-wm-export": stamp },
    body: JSON.stringify({ sessionId }),
  }));
  if (!response.ok) return null;
  return response.json();
}

async function ensureSummaryToken(env: Env, row: SessionRow): Promise<string> {
  if (row.summary_token) return row.summary_token;
  const token = secretToken();
  await env.DB.prepare("UPDATE sessions SET summary_token = ?, summary_enabled = 1 WHERE id = ?").bind(token, row.id).run();
  return token;
}

async function ownedSession(env: Env, id: string, orgId: string): Promise<SessionRow | null> {
  return env.DB.prepare("SELECT * FROM sessions WHERE id = ? AND org_id = ?").bind(id, orgId).first<SessionRow>();
}

function adminOnly(c: Context<{ Bindings: Env; Variables: { user: UserRow } }>): Response | null {
  if (c.get("user").role !== "admin") return c.json({ error: "Admin only" }, 403);
  return null;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

interface TemplateBody {
  name: string;
  description: string;
  runUnit: string;
  roles: string[];
  steps: { title: string; role: string; tool: string; commonFlags: string[] }[];
  questions: string[];
  areas: string[];
}

async function readTemplateBody(c: Context): Promise<TemplateBody> {
  const body = await c.req.json<Partial<TemplateBody>>().catch(() => ({} as Partial<TemplateBody>));
  return {
    name: String(body.name ?? "").slice(0, 120),
    description: String(body.description ?? "").slice(0, 400),
    runUnit: String(body.runUnit ?? "run").slice(0, 40),
    roles: Array.isArray(body.roles) ? body.roles.map(String).slice(0, 12) : [],
    steps: Array.isArray(body.steps) ? body.steps.slice(0, 20).map((step) => ({
      title: String(step.title ?? "").slice(0, 160),
      role: String(step.role ?? ""),
      tool: String(step.tool ?? ""),
      commonFlags: Array.isArray(step.commonFlags) ? step.commonFlags.map(String).slice(0, 6) : [],
    })) : [],
    questions: Array.isArray(body.questions) ? body.questions.map(String).slice(0, 12) : [],
    areas: Array.isArray(body.areas) ? body.areas.map(String) : [],
  };
}

async function insertTemplate(env: Env, input: TemplateBody & { id: string; orgId: string; status: string; version: number; now: string }): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO process_templates
      (id, org_id, industry, name, description, run_unit, icon, data_json, status, version, sample, created_at, updated_at)
     VALUES (?, ?, 'manufacturing', ?, ?, ?, 'factory', ?, ?, ?, 0, ?, ?)`,
  ).bind(
    input.id,
    input.orgId,
    input.name,
    input.description,
    input.runUnit,
    JSON.stringify({ roles: input.roles, steps: input.steps, questions: input.questions, areas: input.areas }),
    input.status,
    input.version,
    input.now,
    input.now,
  ).run();
}

interface ProposalRow {
  id: string;
  kind: string;
  status: string;
  source_template_id: string | null;
  name: string;
  description: string;
  run_unit: string;
  data_json: string;
}

interface Draft {
  name: string;
  description: string;
  runUnit: string;
  roles: string[];
  steps: { title: string; role: string; tool: string; commonFlags: string[] }[];
  questions: string[];
}

async function loadOrg(env: Env): Promise<OrgConfig> {
  const row = await env.DB.prepare("SELECT config_json FROM orgs WHERE id = ?").bind(BOTLANE_ORG.id).first<{ config_json: string }>();
  if (!row) return BOTLANE_ORG;
  return JSON.parse(row.config_json) as OrgConfig;
}
