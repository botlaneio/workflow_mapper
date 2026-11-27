import { sha256Hex } from "../../shared/src/bytes";
import type { CrmState } from "../../shared/src/doc";
import type { CrmPush } from "./crm";

export interface CrmPushOutcome {
  ok: boolean;
  message: string;
  record: CrmState;
}

interface HttpResult {
  status: number;
  body: string;
  json: Record<string, unknown> | null;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function pushToCompAi(options: {
  baseUrl: string;
  apiKey: string;
  push: CrmPush;
  record: CrmState;
  fetchImpl?: Fetcher;
  now?: string;
  log?: (status: number, body: string) => void;
}): Promise<CrmPushOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const record = { ...options.record, noteIds: [...options.record.noteIds] };
    const hash = await contentHash(options.push);
    const now = options.now ?? new Date().toISOString();
    if (!options.push.companyName.trim() || !options.push.contactName.trim()) {
      return { ok: false, message: "Not sent to CRM", record };
    }

  const call = async (method: string, path: string, body?: unknown): Promise<HttpResult> => {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-api-key": options.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) options.log?.(response.status, redact(text.slice(0, 300), options.apiKey));
    let json: Record<string, unknown> | null = null;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        json = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
      } catch {
        json = null;
      }
    }
    return { status: response.status, body: text, json };
  };

  const fail = (status: number): CrmPushOutcome => ({
    ok: false,
    message: status === 401 ? "CRM key missing or expired" : "Not sent to CRM",
    record,
  });

  try {
    const company = await resolveCompany(call, record, options.push, fail);
    if (!company.ok) return company.outcome;
    record.companyId = company.id;

    if (!options.push.contactName.trim()) return fail(400);

    const contact = await resolveContact(call, record, options.push, fail);
    if (!contact.ok) return contact.outcome;
    record.contactId = contact.id;

    if (hash === record.lastPushedHash && record.noteIds.length > 0) {
      record.lastPushedAt = now;
      return { ok: true, message: "Already up to date", record };
    }

    const firstNote = record.noteIds.length === 0;
    const subject = firstNote
      ? `Workflow map: ${options.push.companyName} (discovery call)`
      : `Workflow map: ${options.push.companyName} (updated)`;
    const created = await call("POST", "/activities", {
      type: "NOTE",
      subject,
      body: options.push.noteBody,
      occurredAt: now,
      companyId: record.companyId,
      contactId: record.contactId,
    });
    if (created.status === 401) return fail(401);
    if (created.status === 409) return fail(409);
    if (created.status < 200 || created.status >= 300) return fail(created.status);
    const noteId = stringField(created.json, "id");
    if (!noteId) return fail(500);
    record.noteIds = [...record.noteIds, noteId];
    record.lastPushedAt = now;
    record.lastPushedHash = hash;
    return { ok: true, message: firstNote ? "Sent to CRM" : "Sent an updated note to CRM", record };
  } catch {
    return fail(500);
  }
}

async function contentHash(push: CrmPush): Promise<string> {
  return sha256Hex([
    push.companyName.trim(),
    push.contactName.trim(),
    push.contactRole.trim(),
    push.city.trim(),
    push.processName.trim(),
    push.noteBody,
  ].join("\n"));
}

type Call = (method: string, path: string, body?: unknown) => Promise<HttpResult>;

async function resolveCompany(
  call: Call,
  record: CrmState,
  push: CrmPush,
  fail: (status: number) => CrmPushOutcome,
): Promise<{ ok: true; id: string } | { ok: false; outcome: CrmPushOutcome }> {
  if (record.companyId) {
    const existing = await call("GET", `/companies/${encodeURIComponent(record.companyId)}`);
    if (existing.status === 401) return { ok: false, outcome: fail(401) };
    if (existing.status === 404) record.companyId = "";
    else if (existing.status >= 200 && existing.status < 300) {
      const patch: Record<string, string> = {};
      if (push.companyName && stringField(existing.json, "name") !== push.companyName) patch.name = push.companyName;
      if (push.city && stringField(existing.json, "city") !== push.city) patch.city = push.city;
      if (Object.keys(patch).length) {
        const updated = await call("PATCH", `/companies/${encodeURIComponent(record.companyId)}`, { data: patch });
        if (updated.status === 401) return { ok: false, outcome: fail(401) };
        if (updated.status === 404) record.companyId = "";
        else if (updated.status < 200 || updated.status >= 300) return { ok: false, outcome: fail(updated.status) };
      }
      if (record.companyId) return { ok: true, id: record.companyId };
    } else return { ok: false, outcome: fail(existing.status) };
  }

  const found = await findCompany(call, push.companyName);
  if (found === "unauthorized") return { ok: false, outcome: fail(401) };
  if (found === "failed") return { ok: false, outcome: fail(500) };
  if (found) return { ok: true, id: found };

  const created = await call("POST", "/companies", { name: push.companyName });
  if (created.status === 401) return { ok: false, outcome: fail(401) };
  if (created.status === 409) {
    const again = await findCompany(call, push.companyName);
    if (again && again !== "unauthorized" && again !== "failed") return { ok: true, id: again };
    return { ok: false, outcome: fail(409) };
  }
  if (created.status < 200 || created.status >= 300) return { ok: false, outcome: fail(created.status) };
  const id = stringField(created.json, "id");
  if (!id) return { ok: false, outcome: fail(500) };
  if (push.city) {
    const patched = await call("PATCH", `/companies/${encodeURIComponent(id)}`, { data: { city: push.city } });
    if (patched.status === 401) return { ok: false, outcome: fail(401) };
    if (patched.status < 200 || patched.status >= 300) return { ok: false, outcome: fail(patched.status) };
  }
  return { ok: true, id };
}

async function resolveContact(
  call: Call,
  record: CrmState,
  push: CrmPush,
  fail: (status: number) => CrmPushOutcome,
): Promise<{ ok: true; id: string } | { ok: false; outcome: CrmPushOutcome }> {
  if (record.contactId) {
    const existing = await call("GET", `/contacts/${encodeURIComponent(record.contactId)}`);
    if (existing.status === 401) return { ok: false, outcome: fail(401) };
    if (existing.status === 404) record.contactId = "";
    else if (existing.status >= 200 && existing.status < 300) {
      const patch: Record<string, string> = {};
      if (push.contactName && stringField(existing.json, "firstName") !== push.contactName) patch.firstName = push.contactName;
      if (push.contactRole && stringField(existing.json, "title") !== push.contactRole) patch.title = push.contactRole;
      const company = existing.json && typeof existing.json.company === "object" && existing.json.company
        ? stringField(existing.json.company as Record<string, unknown>, "id")
        : "";
      if (record.companyId && company !== record.companyId) patch.companyId = record.companyId;
      if (Object.keys(patch).length) {
        const updated = await call("PATCH", `/contacts/${encodeURIComponent(record.contactId)}`, { data: patch });
        if (updated.status === 401) return { ok: false, outcome: fail(401) };
        if (updated.status === 404) record.contactId = "";
        else if (updated.status < 200 || updated.status >= 300) return { ok: false, outcome: fail(updated.status) };
      }
      if (record.contactId) return { ok: true, id: record.contactId };
    } else return { ok: false, outcome: fail(existing.status) };
  }

  const found = await findContact(call, push.contactName, record.companyId);
  if (found === "unauthorized") return { ok: false, outcome: fail(401) };
  if (found === "failed") return { ok: false, outcome: fail(500) };
  if (found) return { ok: true, id: found };

  const created = await call("POST", "/contacts", {
    firstName: push.contactName,
    title: push.contactRole,
    companyId: record.companyId,
  });
  if (created.status === 401) return { ok: false, outcome: fail(401) };
  if (created.status === 409) {
    const again = await findContact(call, push.contactName, record.companyId);
    if (again && again !== "unauthorized" && again !== "failed") return { ok: true, id: again };
    return { ok: false, outcome: fail(409) };
  }
  if (created.status < 200 || created.status >= 300) return { ok: false, outcome: fail(created.status) };
  const id = stringField(created.json, "id");
  if (!id) return { ok: false, outcome: fail(500) };
  return { ok: true, id };
}

async function findCompany(call: Call, name: string): Promise<string | "unauthorized" | "failed" | null> {
  const searched = await call("POST", "/companies/search", { q: name, pageSize: 10 });
  if (searched.status === 401) return "unauthorized";
  if (searched.status < 200 || searched.status >= 300) return "failed";
  const rows = Array.isArray(searched.json?.rows) ? searched.json.rows as Record<string, unknown>[] : [];
  const match = rows.find((row) => String(row.name ?? "").trim().toLowerCase() === name.trim().toLowerCase());
  return match ? String(match.id) : null;
}

async function findContact(call: Call, firstName: string, companyId: string): Promise<string | "unauthorized" | "failed" | null> {
  const searched = await call("POST", "/contacts/search", { q: firstName, company: [companyId], pageSize: 50 });
  if (searched.status === 401) return "unauthorized";
  if (searched.status < 200 || searched.status >= 300) return "failed";
  const rows = Array.isArray(searched.json?.rows) ? searched.json.rows as Record<string, unknown>[] : [];
  const match = rows.find((row) => String(row.firstName ?? "").trim().toLowerCase() === firstName.trim().toLowerCase());
  return match ? String(match.id) : null;
}

function stringField(value: Record<string, unknown> | null, key: string): string {
  const field = value?.[key];
  return typeof field === "string" ? field : "";
}

function redact(body: string, apiKey: string): string {
  return apiKey ? body.split(apiKey).join("[redacted]") : body;
}
