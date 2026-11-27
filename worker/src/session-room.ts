import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import { base64ToBytes, bytesToBase64, hmacSign, safeEqual, sha256Hex } from "../../shared/src/bytes";
import { buildClientSummary, clientSummaryText, type ClientSummary } from "../../shared/src/client-summary";
import { CLIENT_LOCKED_META, readCrm, readPrivate, readShared, seedPrivate, seedShared, upsertParticipant, writeCrm } from "../../shared/src/doc";
import { buildOpportunities, toRevealed } from "../../shared/src/estimate";
import { waitHours } from "../../shared/src/format";
import type { Catalog, RevealedEstimates } from "../../shared/src/types";
import { currentUser } from "./auth";
import { crmPushFromSummary } from "./crm";
import { pushToCompAi } from "./crm-compai";
import type { Env, SessionRow } from "./env";

type Role = "presenter" | "client";

interface Attachment {
  role: Role;
  userId: string;
  name: string;
  focus: string;
}

interface Docs {
  shared: Y.Doc;
  priv: Y.Doc;
}

const PALETTE = ["#3466D6", "#D4640A", "#B8379F", "#0F6E56", "#9A3412", "#5333F5"];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function sessionIdFrom(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[2] ?? "";
}

export class SessionRoom extends DurableObject<Env> {
  private docsPromise: Promise<Docs> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private catalog: Catalog | null = null;
  private showEstimates = false;
  private sessionId = "";
  private orgId = "";
  private indexed = "";

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.openSocket(request, url);
    }
    if (url.pathname.endsWith("/init") && request.method === "POST") {
      return this.enqueue(() => this.init(request));
    }
    if (url.pathname.endsWith("/export") && request.method === "POST") {
      return this.enqueue(() => this.exportView(request));
    }
    if (url.pathname.endsWith("/crm") && request.method === "POST") {
      return this.enqueue(() => this.crmPush(request));
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.enqueue(() => this.onMessage(ws, message));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.enqueue(async () => {
      this.broadcastPresence();
    });
    void ws;
  }

  private async openSocket(request: Request, url: URL): Promise<Response> {
    const sessionId = sessionIdFrom(url);
    const session = await this.env.DB.prepare("SELECT * FROM sessions WHERE id = ?").bind(sessionId).first<SessionRow>();
    if (!session) return new Response("Not found", { status: 404 });

    const user = await currentUser(request, this.env);
    let role: Role;
    let userId: string;
    let name: string;
    if (user && user.org_id === session.org_id) {
      role = "presenter";
      userId = user.id;
      name = user.name;
    } else {
      const token = url.searchParams.get("token") ?? "";
      const hash = token ? await sha256Hex(token) : "";
      if (!token || !safeEqual(hash, session.token_hash)) return new Response("Not found", { status: 404 });
      if (!session.link_enabled || session.status !== "live" || Date.parse(session.expires_at) < Date.now()) {
        return new Response("This link has ended", { status: 410 });
      }
      role = "client";
      userId = `guest_${crypto.randomUUID().slice(0, 8)}`;
      name = "Guest";
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { role, userId, name, focus: "" };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async init(request: Request): Promise<Response> {
    let body: {
      sessionId?: string;
      orgId?: string;
      template?: {
        id: string;
        orgId: string;
        industry: string;
        name: string;
        runUnit: string;
        roles: string[];
        steps: { title: string; role: string; tool: string; commonFlags: string[] }[];
        questions: string[];
      };
      catalog?: Catalog;
    };
    try {
      body = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (!body.sessionId || !body.template || !body.catalog || !this.env.AUTH_SECRET) {
      return new Response("Bad request", { status: 400 });
    }
    const expected = await hmacSign(`init.${body.sessionId}`, this.env.AUTH_SECRET);
    if (!safeEqual(request.headers.get("x-wm-init") ?? "", expected)) return new Response("Forbidden", { status: 403 });
    if (await this.ctx.storage.get("ready")) return Response.json({ ok: true });

    const shared = new Y.Doc();
    const priv = new Y.Doc();
    seedShared(shared, {
      ...body.template,
      steps: body.template.steps.map((step) => ({ ...step, commonFlags: step.commonFlags as never })),
    });
    seedPrivate(priv, body.template.questions);
    await this.ctx.storage.put("shared", Y.encodeStateAsUpdate(shared));
    await this.ctx.storage.put("private", Y.encodeStateAsUpdate(priv));
    await this.ctx.storage.put("catalog", body.catalog);
    await this.ctx.storage.put("sessionId", body.sessionId);
    await this.ctx.storage.put("orgId", body.orgId ?? body.template.orgId);
    await this.ctx.storage.put("showEstimates", false);
    await this.ctx.storage.put("ready", true);
    this.catalog = body.catalog;
    this.sessionId = body.sessionId;
    this.orgId = body.orgId ?? body.template.orgId;
    this.showEstimates = false;
    this.docsPromise = Promise.resolve({ shared, priv });
    return Response.json({ ok: true });
  }

  private async exportView(request: Request): Promise<Response> {
    let body: { sessionId?: string };
    try {
      body = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (!body.sessionId || !this.env.AUTH_SECRET) return new Response("Bad request", { status: 400 });
    const expected = await hmacSign(`export.${body.sessionId}`, this.env.AUTH_SECRET);
    if (!safeEqual(request.headers.get("x-wm-export") ?? "", expected)) return new Response("Forbidden", { status: 403 });
    const docs = await this.getDocs();
    const built = this.summaryFrom(docs);
    if (!built) return Response.json({ error: "Session is not ready" }, { status: 409 });
    const { summary, snap, priv } = built;
    const roleName = (id: string) => snap.roles.find((role) => role.id === id)?.name || "";
    const draft = {
      name: snap.processName || "Untitled process",
      description: snap.client.product ? `Saved from a live workshop. They make ${snap.client.product}.` : "Saved from a live workshop.",
      runUnit: snap.runUnit || "run",
      roles: snap.roles.map((role) => role.name).filter(Boolean),
      steps: snap.steps.map((step) => ({
        title: step.title || "Untitled step",
        role: roleName(step.roleId),
        tool: step.tool,
        commonFlags: step.flags,
      })),
      questions: priv?.questions ?? [],
    };
    return Response.json({ summary, draft });
  }

  private async crmPush(request: Request): Promise<Response> {
    let body: { sessionId?: string; summaryUrl?: string; baseUrl?: string };
    try {
      body = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (!body.sessionId || !this.env.AUTH_SECRET) return new Response("Bad request", { status: 400 });
    const expected = await hmacSign(`crm.${body.sessionId}`, this.env.AUTH_SECRET);
    if (!safeEqual(request.headers.get("x-wm-crm") ?? "", expected)) return new Response("Forbidden", { status: 403 });
    if (!this.env.CRM_API_KEY) {
      return Response.json({ ok: true, connected: false, message: "CRM is not connected. Nothing was sent. The note is ready for the real adapter." });
    }
    const docs = await this.getDocs();
    const built = this.summaryFrom(docs);
    if (!built) return Response.json({ ok: false, message: "Not sent to CRM" }, { status: 409 });
    const summaryUrl = body.summaryUrl || "";
    const finalOutcome = await pushToCompAi({
      baseUrl: body.baseUrl || "https://ops-api.botlane.io/rest",
      apiKey: this.env.CRM_API_KEY,
      push: crmPushFromSummary({
        company: built.summary.company,
        contact: built.summary.contact,
        contactRole: built.summary.contactRole,
        city: built.summary.city,
        processName: built.summary.processName,
        summaryText: clientSummaryText(built.summary),
        summaryUrl,
      }),
      record: readCrm(docs.priv),
      log: (status, text) => console.error(`CRM ${status} ${text}`),
    });
    const updates: Uint8Array[] = [];
    const collect = (update: Uint8Array) => updates.push(update);
    docs.priv.on("update", collect);
    writeCrm(docs.priv, finalOutcome.record);
    docs.priv.off("update", collect);
    await this.persist(docs);
    if (updates.length) this.sendTo("presenter", { t: "update", doc: "private", update: bytesToBase64(Y.mergeUpdates(updates)) });
    return Response.json({ ok: finalOutcome.ok, message: finalOutcome.message });
  }

  private summaryFrom(docs: Docs): { summary: ClientSummary; snap: NonNullable<ReturnType<typeof readShared>>; priv: ReturnType<typeof readPrivate> } | null {
    const snap = readShared(docs.shared);
    const priv = readPrivate(docs.priv);
    if (!snap || !this.catalog) return null;
    const summary = buildClientSummary({
      company: snap.client.company,
      contact: snap.client.contact,
      contactRole: snap.client.contactRole,
      city: snap.client.city,
      product: snap.client.product,
      teamSize: snap.client.teamSize,
      processName: snap.processName,
      runUnit: snap.runUnit,
      runsPerWeek: snap.runsPerWeek,
      roles: snap.roles.map((role) => ({ id: role.id, name: role.name })),
      steps: snap.steps.map((step) => ({
        id: step.id,
        title: step.title,
        roleId: step.roleId,
        tool: step.tool,
        minutes: step.minutes,
        waitValue: step.waitValue,
        waitUnit: step.waitUnit,
        flags: step.flags,
      })),
      pains: snap.pains.map((pain) => pain.text),
      whatGood: snap.whatGood,
      overrides: priv?.overrides ?? {},
    }, this.catalog);
    return { summary, snap, priv };
  }

  private loaded: Docs | null = null;

  private async getDocs(): Promise<Docs> {
    if (!this.docsPromise) this.docsPromise = this.loadDocs();
    const docs = await this.docsPromise;
    this.loaded = docs;
    return docs;
  }

  private async loadDocs(): Promise<Docs> {
    const shared = new Y.Doc();
    const priv = new Y.Doc();
    const sharedBytes = toBytes(await this.ctx.storage.get("shared"));
    const privateBytes = toBytes(await this.ctx.storage.get("private"));
    if (sharedBytes) Y.applyUpdate(shared, sharedBytes);
    if (privateBytes) Y.applyUpdate(priv, privateBytes);
    this.catalog = (await this.ctx.storage.get<Catalog>("catalog")) ?? null;
    this.showEstimates = (await this.ctx.storage.get("showEstimates")) === true;
    this.sessionId = String((await this.ctx.storage.get("sessionId")) ?? "");
    this.orgId = String((await this.ctx.storage.get("orgId")) ?? "");
    this.indexed = String((await this.ctx.storage.get("indexed")) ?? "");
    return { shared, priv };
  }

  private async onMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (raw.length > 300_000) return;
    let msg: { t?: string; doc?: string; update?: string; sv?: string; name?: string; clientId?: string; focus?: string; key?: string; value?: boolean };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const docs = await this.getDocs();
    if (msg.t === "ping") {
      this.send(ws, { t: "pong" });
      return;
    }
    if (msg.t === "hello") {
      const name = String(msg.name ?? "").trim().slice(0, 80);
      if (name) att.name = name;
      if (att.role === "client" && msg.clientId && /^[A-Za-z0-9_-]{8,40}$/.test(msg.clientId)) att.userId = `guest_${msg.clientId}`;
      ws.serializeAttachment(att);
      const updates: Uint8Array[] = [];
      const collect = (update: Uint8Array) => updates.push(update);
      docs.shared.on("update", collect);
      upsertParticipant(docs.shared, att.userId, att.name, att.role);
      docs.shared.off("update", collect);
      await this.persist(docs);
      if (updates.length) {
        this.sendTo("all", { t: "update", doc: "shared", update: bytesToBase64(Y.mergeUpdates(updates)) }, ws);
      }
      this.broadcastPresence();
      return;
    }
    if (msg.t === "focus") {
      att.focus = String(msg.focus ?? "").slice(0, 80);
      ws.serializeAttachment(att);
      this.broadcastPresence();
      return;
    }
    if (msg.t === "set-flag" && msg.key === "showEstimates") {
      if (att.role !== "presenter") return;
      this.showEstimates = msg.value === true;
      await this.ctx.storage.put("showEstimates", this.showEstimates);
      this.sendTo("all", { t: "flag", key: "showEstimates", value: this.showEstimates });
      await this.pushRevealed(true);
      return;
    }
    if ((msg.t === "sync-step1" || msg.t === "sync-step2" || msg.t === "update") && (msg.doc === "shared" || msg.doc === "private")) {
      if (msg.doc === "private" && att.role !== "presenter") return;
      if (msg.t === "sync-step1") {
        const doc = msg.doc === "private" ? docs.priv : docs.shared;
        let sv: Uint8Array;
        try {
          sv = base64ToBytes(String(msg.sv ?? ""));
        } catch {
          return;
        }
        this.send(ws, { t: "sync-step2", doc: msg.doc, update: bytesToBase64(Y.encodeStateAsUpdate(doc, sv)) });
        this.send(ws, { t: "sync-step1", doc: msg.doc, sv: bytesToBase64(Y.encodeStateVector(doc)) });
        if (att.role === "client" && msg.doc === "shared") {
          this.send(ws, { t: "flag", key: "showEstimates", value: this.showEstimates });
          this.send(ws, { t: "revealed", estimates: this.showEstimates ? this.revealedUsing(docs) : null });
          this.send(ws, { t: "spotlight", titles: this.spotlightTitles(docs) });
        }
        this.broadcastPresence();
        return;
      }
      let incoming: Uint8Array;
      try {
        incoming = base64ToBytes(String(msg.update ?? ""));
      } catch {
        return;
      }
      if (incoming.byteLength > 200_000) return;
      if (msg.doc === "private") await this.applyPrivate(docs, incoming, ws);
      else await this.applyShared(docs, incoming, att.role, ws);
    }
  }

  private async applyShared(docs: Docs, incoming: Uint8Array, role: Role, sender: WebSocket): Promise<void> {
    const meta = docs.shared.getMap("meta");
    const before: Record<string, unknown> = {};
    for (const key of CLIENT_LOCKED_META) before[key] = meta.get(key);
    const updates: Uint8Array[] = [];
    const collect = (update: Uint8Array) => updates.push(update);
    docs.shared.on("update", collect);
    try {
      Y.applyUpdate(docs.shared, incoming);
    } catch {
      docs.shared.off("update", collect);
      return;
    }
    if (role === "client") {
      for (const key of CLIENT_LOCKED_META) {
        if (meta.get(key) !== before[key]) meta.set(key, before[key]);
      }
    }
    docs.shared.off("update", collect);
    if (!updates.length) return;
    const peer = Y.mergeUpdates(updates);
    this.sendTo("all", { t: "update", doc: "shared", update: bytesToBase64(peer) }, sender);
    if (role === "client" && updates.length > 1) {
      this.send(sender, { t: "update", doc: "shared", update: bytesToBase64(Y.mergeUpdates(updates.slice(1))) });
    }
    await this.persist(docs);
    await this.touchIndex(docs);
    await this.pushRevealed(false);
    this.sendTo("client", { t: "spotlight", titles: this.spotlightTitles(docs) });
  }

  private async applyPrivate(docs: Docs, incoming: Uint8Array, sender: WebSocket): Promise<void> {
    const updates: Uint8Array[] = [];
    const collect = (update: Uint8Array) => updates.push(update);
    docs.priv.on("update", collect);
    try {
      Y.applyUpdate(docs.priv, incoming);
    } catch {
      docs.priv.off("update", collect);
      return;
    }
    docs.priv.off("update", collect);
    if (!updates.length) return;
    this.sendTo("presenter", { t: "update", doc: "private", update: bytesToBase64(Y.mergeUpdates(updates)) }, sender);
    await this.persist(docs);
    await this.pushRevealed(false);
  }

  private async persist(docs: Docs): Promise<void> {
    await this.ctx.storage.put("shared", Y.encodeStateAsUpdate(docs.shared));
    await this.ctx.storage.put("private", Y.encodeStateAsUpdate(docs.priv));
  }

  private async touchIndex(docs: Docs): Promise<void> {
    const snap = readShared(docs.shared);
    if (!snap || !this.sessionId) return;
    const key = `${snap.client.company}\n${snap.processName}`;
    if (key === this.indexed) return;
    this.indexed = key;
    await this.ctx.storage.put("indexed", key);
    await this.env.DB.prepare("UPDATE sessions SET company = ?, process_name = ?, updated_at = ? WHERE id = ? AND org_id = ?")
      .bind(snap.client.company, snap.processName, new Date().toISOString(), this.sessionId, this.orgId)
      .run();
  }

  private lastRevealed = "";

  private async pushRevealed(force: boolean): Promise<void> {
    const docs = await this.getDocs();
    const estimates = this.showEstimates ? this.revealedUsing(docs) : null;
    const json = JSON.stringify(estimates);
    if (!force && json === this.lastRevealed) return;
    this.lastRevealed = json;
    this.sendTo("client", { t: "revealed", estimates });
  }

  private spotlightTitles(docs: Docs): string[] {
    const snap = readShared(docs.shared);
    if (!snap?.reveal || !this.catalog) return [];
    const priv = readPrivate(docs.priv);
    const steps = snap.steps.map((step, index) => ({
      id: step.id,
      title: step.title,
      minutes: step.minutes,
      waitHours: index < snap.steps.length - 1 ? waitHours(step.waitValue, step.waitUnit) : 0,
      flags: step.flags,
      roleName: snap.roles.find((role) => role.id === step.roleId)?.name ?? "",
      index,
    }));
    return buildOpportunities({
      runsPerWeek: snap.runsPerWeek,
      steps,
      overrides: priv?.overrides ?? {},
      pains: [],
      catalog: this.catalog,
    }).ranked.map((item) => item.title);
  }

  private revealedUsing(docs: Docs): RevealedEstimates | null {
    if (!this.catalog) return null;
    const snap = readShared(docs.shared);
    const priv = readPrivate(docs.priv);
    if (!snap) return null;
    const steps = snap.steps.map((step, index) => ({
      id: step.id,
      title: step.title,
      minutes: step.minutes,
      waitHours: index < snap.steps.length - 1 ? waitHours(step.waitValue, step.waitUnit) : 0,
      flags: step.flags,
      roleName: snap.roles.find((role) => role.id === step.roleId)?.name ?? "",
      index,
    }));
    return toRevealed(
      buildOpportunities({
        runsPerWeek: snap.runsPerWeek,
        steps,
        overrides: priv?.overrides ?? {},
        pains: snap.pains.map((pain) => ({ text: pain.text, area: priv?.painAreas[pain.id] })),
        catalog: this.catalog,
      }),
    );
  }

  private send(ws: WebSocket, message: unknown): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* socket already closed */
    }
  }

  private sendTo(who: "all" | Role, message: unknown, except?: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      const att = socket.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      if (who !== "all" && att.role !== who) continue;
      this.send(socket, message);
    }
  }

  private broadcastPresence(): void {
    const people = this.ctx.getWebSockets().map((socket) => {
      const att = socket.deserializeAttachment() as Attachment;
      return {
        id: att.userId,
        name: att.name || "Guest",
        role: att.role,
        focus: att.focus || "",
        color: colorFor(att.userId),
      };
    });
    this.sendTo("all", { t: "presence", people });
  }
}
