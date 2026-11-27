import { describe, expect, it } from "vitest";
import { emptyCrm, type CrmState } from "../../shared/src/doc";
import type { CrmPush } from "./crm";
import { pushToCompAi } from "./crm-compai";

const KEY = "crm_test_key_should_not_be_logged";

function push(extra: Partial<CrmPush> = {}): CrmPush {
  return {
    companyName: "Sample Metals",
    contactName: "Ravi",
    contactRole: "Owner",
    city: "Pune",
    processName: "Enquiry to dispatch",
    noteTitle: "Workflow map: Enquiry to dispatch",
    noteBody: "Plain summary\n\nhttps://map.botlane.io/s/token",
    summaryUrl: "https://map.botlane.io/s/token",
    ...extra,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function pathOf(url: string): string {
  return new URL(url).pathname.replace(/^\/rest/, "");
}

describe("Comp AI adapter", () => {
  it("finds then creates on the first push", async () => {
    const calls: { url: string; method: string; body?: unknown; key?: string }[] = [];
    const outcome = await pushToCompAi({
      baseUrl: "https://ops-api.botlane.io/rest/",
      apiKey: KEY,
      push: push(),
      record: emptyCrm(),
      now: "2026-11-27T12:00:00.000Z",
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, key: new Headers(init?.headers).get("x-api-key") ?? "" });
        if (url.endsWith("/companies/search")) return json(200, { rows: [], total: 0 });
        if (url.endsWith("/companies/co_1")) return json(200, { id: "co_1", name: "Sample Metals", domain: null });
        if (url.endsWith("/companies")) return json(200, { id: "co_1", name: "Sample Metals", domain: null });
        if (url.endsWith("/contacts/search")) return json(200, { rows: [], total: 0 });
        if (url.endsWith("/contacts")) return json(200, { id: "ct_1", firstName: "Ravi", lastName: null });
        if (url.endsWith("/activities")) return json(200, { id: "note_1", type: "NOTE" });
        return json(500, { message: "unexpected" });
      },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toBe("Sent to CRM");
    expect(outcome.record.companyId).toBe("co_1");
    expect(outcome.record.contactId).toBe("ct_1");
    expect(outcome.record.noteIds).toEqual(["note_1"]);
    expect(calls.map((call) => `${call.method} ${pathOf(call.url)}`)).toEqual([
      "POST /companies/search",
      "POST /companies",
      "PATCH /companies/co_1",
      "POST /contacts/search",
      "POST /contacts",
      "POST /activities",
    ]);
    expect(calls.every((call) => call.key === KEY)).toBe(true);
    const note = calls.at(-1)?.body as { subject: string; type: string; companyId: string; contactId: string };
    expect(note.type).toBe("NOTE");
    expect(note.subject).toBe("Workflow map: Sample Metals (discovery call)");
    expect(note.companyId).toBe("co_1");
    expect(calls[3]?.body).toMatchObject({ q: "Ravi", company: ["co_1"] });
    expect(calls[2]?.body).toEqual({ data: { city: "Pune" } });
  });

  it("skips the note when the hash is unchanged", async () => {
    const first = await pushToCompAi({
      baseUrl: "https://ops-api.botlane.io/rest",
      apiKey: KEY,
      push: push(),
      record: emptyCrm(),
      fetchImpl: async (url) => {
        if (url.endsWith("/companies/search")) return json(200, { rows: [{ id: "co_1", name: "Sample Metals" }], total: 1 });
        if (url.endsWith("/contacts/search")) return json(200, { rows: [{ id: "ct_1", firstName: "Ravi" }], total: 1 });
        if (url.endsWith("/activities")) return json(200, { id: "note_1", type: "NOTE" });
        return json(500, {});
      },
    });
    const calls: string[] = [];
    const again = await pushToCompAi({
      baseUrl: "https://ops-api.botlane.io/rest",
      apiKey: KEY,
      push: push(),
      record: first.record,
      fetchImpl: async (url) => {
        calls.push(pathOf(url));
        if (url.endsWith("/companies/co_1")) return json(200, { id: "co_1", name: "Sample Metals", city: "Pune" });
        if (url.endsWith("/contacts/ct_1")) return json(200, { id: "ct_1", firstName: "Ravi", title: "Owner", company: { id: "co_1", name: "Sample Metals" } });
        return json(500, { message: "should not create" });
      },
    });
    expect(again.message).toBe("Already up to date");
    expect(again.record.noteIds).toEqual(["note_1"]);
    expect(calls.some((path) => path.includes("activities"))).toBe(false);
  });

  it("adds an updated note and patches changed fields", async () => {
    const stored: CrmState = {
      companyId: "co_1",
      contactId: "ct_1",
      noteIds: ["note_1"],
      lastPushedAt: "2026-11-27T00:00:00.000Z",
      lastPushedHash: "stale",
    };
    const calls: { path: string; method: string; body?: unknown }[] = [];
    const outcome = await pushToCompAi({
      baseUrl: "https://ops-api.botlane.io/rest",
      apiKey: KEY,
      push: push({ contactRole: "Plant Manager", noteBody: "Changed summary\n\nhttps://map.botlane.io/s/token" }),
      record: stored,
      fetchImpl: async (url, init) => {
        const path = pathOf(url);
        calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (path === "/companies/co_1" && init?.method === "GET") return json(200, { id: "co_1", name: "Sample Metals", city: "Pune" });
        if (path === "/companies/co_1" && init?.method === "PATCH") return json(200, { id: "co_1", name: "Sample Metals", domain: null });
        if (path === "/contacts/ct_1" && init?.method === "GET") return json(200, { id: "ct_1", firstName: "Ravi", title: "Owner", company: { id: "co_1" } });
        if (path === "/contacts/ct_1" && init?.method === "PATCH") return json(200, { id: "ct_1", firstName: "Ravi", lastName: null });
        if (path === "/activities") return json(200, { id: "note_2", type: "NOTE" });
        return json(500, {});
      },
    });
    expect(outcome.message).toBe("Sent an updated note to CRM");
    expect(outcome.record.noteIds).toEqual(["note_1", "note_2"]);
    const contactPatch = calls.find((call) => call.path === "/contacts/ct_1" && call.method === "PATCH");
    expect(contactPatch?.body).toEqual({ data: { title: "Plant Manager" } });
    const note = calls.find((call) => call.path === "/activities")?.body as { subject: string };
    expect(note.subject).toBe("Workflow map: Sample Metals (updated)");
  });

  it("falls back to find-or-create when a stored id is gone", async () => {
    const calls: string[] = [];
    const outcome = await pushToCompAi({
      baseUrl: "https://ops-api.botlane.io/rest",
      apiKey: KEY,
      push: push(),
      record: { ...emptyCrm(), companyId: "gone_co", contactId: "gone_ct", noteIds: ["note_old"], lastPushedHash: "stale" },
      fetchImpl: async (url, init) => {
        const path = pathOf(url);
        calls.push(`${init?.method ?? "GET"} ${path}`);
        if (path === "/companies/gone_co") return json(404, { message: "Not found", code: "NOT_FOUND" });
        if (path === "/contacts/gone_ct") return json(404, { message: "Not found", code: "NOT_FOUND" });
        if (path === "/companies/search") return json(200, { rows: [], total: 0 });
        if (path === "/companies/co_new") return json(200, { id: "co_new", name: "Sample Metals", domain: null });
        if (path === "/companies") return json(200, { id: "co_new", name: "Sample Metals", domain: null });
        if (path === "/contacts/search") return json(200, { rows: [], total: 0 });
        if (path === "/contacts") return json(200, { id: "ct_new", firstName: "Ravi", lastName: null });
        if (path === "/activities") return json(200, { id: "note_new", type: "NOTE" });
        return json(500, {});
      },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.record.companyId).toBe("co_new");
    expect(outcome.record.contactId).toBe("ct_new");
    expect(calls[0]).toBe("GET /companies/gone_co");
    expect(calls).toContain("POST /companies");
    expect(calls).toContain("GET /contacts/gone_ct");
  });

  it("uses the existing company when create returns 409", async () => {
    let searches = 0;
    const outcome = await pushToCompAi({
      baseUrl: "https://ops-api.botlane.io/rest",
      apiKey: KEY,
      push: push(),
      record: emptyCrm(),
      fetchImpl: async (url, init) => {
        const path = pathOf(url);
        if (path === "/companies/search") {
          searches += 1;
          if (searches === 1) return json(200, { rows: [{ id: "other", name: "Sample Metals Pvt" }], total: 1 });
          return json(200, { rows: [{ id: "co_exact", name: "Sample Metals" }], total: 1 });
        }
        if (path === "/companies" && init?.method === "POST") return json(409, { message: "Sample Metals already uses the domain.", code: "CONFLICT" });
        if (path === "/contacts/search") return json(200, { rows: [], total: 0 });
        if (path === "/contacts") return json(200, { id: "ct_1", firstName: "Ravi", lastName: null });
        if (path === "/activities") return json(200, { id: "note_1", type: "NOTE" });
        return json(500, {});
      },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.record.companyId).toBe("co_exact");
  });

  it("reports an expired key on 401 and does not log the key", async () => {
    const logs: string[] = [];
    const outcome = await pushToCompAi({
      baseUrl: "https://ops-api.botlane.io/rest",
      apiKey: KEY,
      push: push(),
      record: emptyCrm(),
      log: (status, body) => logs.push(`${status} ${body}`),
      fetchImpl: async () => json(401, { message: `bad ${KEY}`, code: "UNAUTHORIZED" }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe("CRM key missing or expired");
    expect(outcome.record.companyId).toBe("");
    expect(logs[0]).toContain("401");
    expect(logs.join("")).not.toContain(KEY);
    expect(logs.join("")).toContain("[redacted]");
  });
});
