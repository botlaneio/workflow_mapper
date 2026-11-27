import { Hono } from "hono";
import { BOTLANE_ORG, publicOrg } from "../../shared/src/catalog";
import { hmacSign, readableCode, safeEqual, secretToken, sha256Hex } from "../../shared/src/bytes";
import type { Catalog, OrgConfig, ProcessTemplate } from "../../shared/src/types";
import { clearedCookie, cookieHeader, currentUser, issueCookie, passwordsMatch, sameOrigin } from "./auth";
import type { Env, SessionRow, UserRow } from "./env";
import { registerPhase2 } from "./phase2";
import { ensureReady } from "./seed";
import { SessionRoom } from "./session-room";

export { SessionRoom };

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use("*", async (c, next) => {
  await ensureReady(c.env);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/public/brand", async (c) => {
  const org = await loadOrg(c.env);
  const catalog = await loadCatalog(c.env, org.id);
  return c.json({
    org: publicOrg(org),
    flags: catalog.flagOrder.map((key) => {
      const flag = catalog.flags[key];
      return { key: flag.key, label: flag.label, icon: flag.icon };
    }),
    areas: catalog.areaOrder.map((key) => catalog.areas[key]),
  });
});

app.get("/api/public/processes", async (c) => {
  const org = await loadOrg(c.env);
  const rows = await c.env.DB.prepare(
    "SELECT id, name, description, icon, sample FROM process_templates WHERE org_id = ? AND status = 'active' AND industry = 'manufacturing' ORDER BY name",
  )
    .bind(org.id)
    .all<{ id: string; name: string; description: string; icon: string; sample: number }>();
  return c.json({
    processes: (rows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      sample: row.sample === 1,
    })),
  });
});

app.get("/api/join/:code/:token", async (c) => {
  const session = await sessionByCode(c.env, c.req.param("code"));
  if (!session || !(await tokenMatches(c.req.param("token"), session.token_hash))) {
    return c.json({ ok: false, error: "This link is not valid or has expired." }, 404);
  }
  if (!session.link_enabled || session.status !== "live" || Date.parse(session.expires_at) < Date.now()) {
    return c.json({ ok: false, error: "This link is not valid or has expired." }, 410);
  }
  return c.json({
    ok: true,
    id: session.id,
    code: session.code,
    processName: session.process_name,
    company: session.company,
    expiresAt: session.expires_at,
    status: session.status,
  });
});

app.post("/api/auth/dev-login", async (c) => {
  if (c.env.AUTH_MODE !== "dev") return c.json({ error: "Not found" }, 404);
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
  const password = c.env.DEV_LOGIN_PASSWORD ?? "";
  const secret = c.env.AUTH_SECRET ?? "";
  if (!password || !secret) return c.json({ error: "Dev login is not configured" }, 503);
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({ email: "", password: "" }));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!passwordsMatch(String(body.password ?? ""), password)) {
    return c.json({ error: "Email or password is wrong" }, 401);
  }
  const user = await c.env.DB.prepare("SELECT id, org_id, email, name, role FROM users WHERE lower(email) = ?")
    .bind(email)
    .first<UserRow>();
  if (!user) return c.json({ error: "Email or password is wrong" }, 401);
  const token = await issueCookie(user.id, secret);
  const secure = new URL(c.req.url).protocol === "https:";
  c.header("Set-Cookie", cookieHeader(token, secure));
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.org_id });
});

app.post("/api/auth/logout", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
  const secure = new URL(c.req.url).protocol === "https:";
  c.header("Set-Cookie", clearedCookie(secure));
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const user = await currentUser(c.req.raw, c.env);
  if (!user) return c.json({ user: null }, 401);
  return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.org_id } });
});

app.use("/api/presenter/*", async (c, next) => {
  const user = await currentUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Sign in required" }, 401);
  c.set("user", user);
  await next();
});

app.get("/api/presenter/catalog", async (c) => {
  const user = c.get("user");
  return c.json(await loadCatalog(c.env, user.org_id));
});

app.get("/api/presenter/templates", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM process_templates WHERE org_id = ? AND status = 'active' ORDER BY name",
  )
    .bind(user.org_id)
    .all<TemplateRow>();
  return c.json({ templates: (rows.results ?? []).map(presentTemplate) });
});

app.get("/api/presenter/sessions", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim().slice(0, 80).replace(/[%_]/g, "");
  const like = `%${q}%`;
  const rows = await c.env.DB.prepare(
    `SELECT s.*, u.name AS owner_name
     FROM sessions s JOIN users u ON u.id = s.owner_id
     WHERE s.org_id = ?
       AND (? = '' OR s.company LIKE ? OR s.process_name LIKE ? OR s.code LIKE ?)
     ORDER BY s.updated_at DESC
     LIMIT 100`,
  )
    .bind(user.org_id, q, like, like, like)
    .all<SessionRow>();
  return c.json({
    sessions: (rows.results ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      company: row.company,
      processName: row.process_name,
      status: row.status,
      industry: row.industry,
      ownerName: row.owner_name ?? "",
      expiresAt: row.expires_at,
      linkEnabled: row.link_enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

app.post("/api/presenter/sessions", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
  const user = c.get("user");
  const body = await c.req.json<{ templateId?: string }>().catch(() => ({ templateId: "" }));
  const template = await c.env.DB.prepare("SELECT * FROM process_templates WHERE id = ? AND org_id = ? AND status = 'active'")
    .bind(body.templateId ?? "", user.org_id)
    .first<TemplateRow>();
  if (!template) return c.json({ error: "Choose a process template" }, 400);
  const catalog = await loadCatalog(c.env, user.org_id);
  const data = JSON.parse(template.data_json) as { roles: string[]; steps: ProcessTemplate["steps"]; questions: string[]; areas: string[] };
  const id = crypto.randomUUID();
  const token = secretToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let code = readableCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await c.env.DB.prepare("SELECT id FROM sessions WHERE org_id = ? AND code = ?").bind(user.org_id, code).first();
    if (!clash) break;
    code = readableCode();
  }
  const summaryToken = secretToken();
  await c.env.DB.prepare(
    `INSERT INTO sessions
      (id, org_id, code, token_hash, join_token, expires_at, industry, owner_id, template_id, company, process_name, status, link_enabled, summary_token, summary_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'live', 1, ?, 1, ?, ?)`,
  )
    .bind(id, user.org_id, code, tokenHash, token, expires, template.industry, user.id, template.id, template.name, summaryToken, now, now)
    .run();

  if (!c.env.AUTH_SECRET) return c.json({ error: "AUTH_SECRET is not configured" }, 503);
  const stamp = await hmacSign(`init.${id}`, c.env.AUTH_SECRET);
  const stub = c.env.SESSION_ROOM.get(c.env.SESSION_ROOM.idFromName(id));
  const init = await stub.fetch(
    new Request("https://session/init", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wm-init": stamp },
      body: JSON.stringify({
        sessionId: id,
        orgId: user.org_id,
        catalog,
        template: {
          id: template.id,
          orgId: user.org_id,
          industry: template.industry,
          name: template.name,
          runUnit: template.run_unit,
          roles: data.roles,
          steps: data.steps,
          questions: data.questions,
        },
      }),
    }),
  );
  if (!init.ok) return c.json({ error: "Could not open the session room" }, 500);
  const origin = new URL(c.req.url).origin;
  return c.json({
    id,
    code,
    joinUrl: `${origin}/join/${code}/${token}`,
    expiresAt: expires,
    processName: template.name,
    status: "live",
  });
});

app.get("/api/presenter/sessions/:id", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT s.*, u.name AS owner_name FROM sessions s JOIN users u ON u.id = s.owner_id WHERE s.id = ? AND s.org_id = ?")
    .bind(c.req.param("id"), user.org_id)
    .first<SessionRow>();
  if (!row) return c.json({ error: "Session not found" }, 404);
  const origin = new URL(c.req.url).origin;
  return c.json({
    id: row.id,
    code: row.code,
    joinUrl: `${origin}/join/${row.code}/${row.join_token}`,
    company: row.company,
    processName: row.process_name,
    status: row.status,
    industry: row.industry,
    ownerName: row.owner_name ?? "",
    expiresAt: row.expires_at,
    linkEnabled: row.link_enabled === 1,
    summaryUrl: row.summary_token ? `${origin}/s/${row.summary_token}` : "",
    summaryEnabled: row.summary_enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

app.post("/api/presenter/sessions/:id/end", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
  return updateSession(c, { status: "completed", link_enabled: 0 });
});

app.post("/api/presenter/sessions/:id/archive", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
  return updateSession(c, { status: "archived", link_enabled: 0 });
});

app.post("/api/presenter/sessions/:id/link", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Bad origin" }, 403);
  const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({ enabled: false }));
  return updateSession(c, { link_enabled: body.enabled ? 1 : 0 });
});

app.all("/api/ai/*", async (c) => {
  const user = await currentUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Sign in required" }, 401);
  return c.json({ error: "AI suggestions are not enabled yet. Nothing is sent to a model." }, 501);
});

app.get("/api/room/:id/ws", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return c.text("Expected WebSocket", 426);
  const id = c.req.param("id");
  const stub = c.env.SESSION_ROOM.get(c.env.SESSION_ROOM.idFromName(id));
  return stub.fetch(c.req.raw);
});

registerPhase2(app);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;

interface TemplateRow {
  id: string;
  org_id: string;
  industry: string;
  name: string;
  description: string;
  run_unit: string;
  icon: string;
  data_json: string;
  status: string;
  version: number;
  sample: number;
}

function presentTemplate(row: TemplateRow) {
  const data = JSON.parse(row.data_json) as { roles: string[]; steps: unknown[]; questions: string[]; areas: string[] };
  return {
    id: row.id,
    orgId: row.org_id,
    industry: row.industry,
    name: row.name,
    description: row.description,
    runUnit: row.run_unit,
    icon: row.icon,
    roles: data.roles,
    steps: data.steps,
    questions: data.questions,
    areas: data.areas,
    status: row.status,
    version: row.version,
    sample: row.sample === 1,
  };
}

async function loadOrg(env: Env): Promise<OrgConfig> {
  const row = await env.DB.prepare("SELECT config_json FROM orgs WHERE id = ?").bind(BOTLANE_ORG.id).first<{ config_json: string }>();
  if (!row) return BOTLANE_ORG;
  return JSON.parse(row.config_json) as OrgConfig;
}

async function loadCatalog(env: Env, orgId: string): Promise<Catalog> {
  const row = await env.DB.prepare("SELECT data_json FROM catalogs WHERE org_id = ? AND kind = 'full'").bind(orgId).first<{ data_json: string }>();
  if (!row) throw new Error("Catalog missing");
  return JSON.parse(row.data_json) as Catalog;
}

async function sessionByCode(env: Env, code: string): Promise<SessionRow | null> {
  return env.DB.prepare("SELECT * FROM sessions WHERE code = ?").bind(code.toUpperCase()).first<SessionRow>();
}

async function tokenMatches(token: string, hash: string): Promise<boolean> {
  if (!token || !hash) return false;
  return safeEqual(await sha256Hex(token), hash);
}

async function updateSession(
  c: { env: Env; get: (key: "user") => UserRow; req: { param: (name: string) => string } },
  patch: { status?: SessionRow["status"]; link_enabled?: number },
): Promise<Response> {
  const user = c.get("user");
  const current = await c.env.DB.prepare("SELECT * FROM sessions WHERE id = ? AND org_id = ?").bind(c.req.param("id"), user.org_id).first<SessionRow>();
  if (!current) return Response.json({ error: "Session not found" }, { status: 404 });
  const status = patch.status ?? current.status;
  const link = patch.link_enabled ?? current.link_enabled;
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE sessions SET status = ?, link_enabled = ?, updated_at = ? WHERE id = ?").bind(status, link, now, current.id).run();
  return Response.json({ ok: true, status, linkEnabled: link === 1 });
}
