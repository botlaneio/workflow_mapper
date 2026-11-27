import { chromium } from "playwright-core";
import * as Y from "yjs";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const password = vars.DEV_LOGIN_PASSWORD;
const artifacts = "/opt/cursor/artifacts";
mkdirSync(artifacts, { recursive: true });
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const b64 = (bytes) => {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
};
const unb64 = (value) => {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};
const inflate = (frame) => {
  const parts = [frame];
  for (const match of frame.match(/[A-Za-z0-9+/]{16,}={0,2}/g) || []) {
    try { parts.push(Buffer.from(match, "base64").toString("utf8")); } catch { /* binary */ }
  }
  return parts.join("\n");
};

const login = await fetch(`${base}/api/auth/dev-login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: "admin@botlane.io", password }),
});
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
check("admin login", login.ok);
const sales = await fetch(`${base}/api/auth/dev-login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: "sales@botlane.io", password }),
});
check("sales email is not on the allowlist", sales.status === 401);

const created = await (await fetch(`${base}/api/presenter/sessions`, {
  method: "POST",
  headers: { cookie, "content-type": "application/json", origin: base },
  body: JSON.stringify({ templateId: "mfg-enquiry-to-dispatch" }),
})).json();
const token = new URL(created.joinUrl).pathname.split("/").pop();
const detail = await (await fetch(`${base}/api/presenter/sessions/${created.id}`, { headers: { cookie } })).json();
const summaryToken = detail.summaryUrl.split("/").pop();
const summary = await (await fetch(`${base}/api/summary/${summaryToken}`)).json();
const summaryBlob = JSON.stringify(summary);
for (const needle of ["pricingHint", "areaOverrides", "dealSize", "Connect the tools", "factor", "SENTINEL_PRIVATE"]) {
  check(`summary hides ${needle}`, !summaryBlob.includes(needle));
}
check("summary names the process", summary.processName === "Enquiry to dispatch");
const pdf = Buffer.from(await (await fetch(`${base}/api/summary/${summaryToken}/pdf`)).arrayBuffer());
check("pdf starts with the PDF header", pdf.subarray(0, 5).toString() === "%PDF-");
writeFileSync(`${artifacts}/summary.pdf`, pdf);

const wsBase = base.replace(/^http/, "ws");
const presenter = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`${wsBase}/api/room/${created.id}/ws`, { headers: { cookie } });
  const frames = [];
  ws.addEventListener("message", (event) => frames.push(String(event.data)));
  ws.addEventListener("open", () => resolve({ ws, frames }));
  ws.addEventListener("error", () => reject(new Error("presenter socket")));
});
const client = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`${wsBase}/api/room/${created.id}/ws?token=${encodeURIComponent(token)}`);
  const frames = [];
  ws.addEventListener("message", (event) => frames.push(String(event.data)));
  ws.addEventListener("open", () => resolve({ ws, frames }));
  ws.addEventListener("error", () => reject(new Error("client socket")));
});
const shared = new Y.Doc();
const priv = new Y.Doc();
const send = (ws, message) => ws.send(JSON.stringify(message));
send(presenter.ws, { t: "hello", name: "Solo" });
send(presenter.ws, { t: "sync-step1", doc: "shared", sv: b64(Y.encodeStateVector(shared)) });
send(presenter.ws, { t: "sync-step1", doc: "private", sv: b64(Y.encodeStateVector(priv)) });
send(client.ws, { t: "hello", name: "Ravi", clientId: "abcdef1234567890" });
send(client.ws, { t: "sync-step1", doc: "shared", sv: b64(Y.encodeStateVector(new Y.Doc())) });
await new Promise((resolve) => setTimeout(resolve, 400));
for (const raw of presenter.frames) {
  const msg = JSON.parse(raw);
  if ((msg.t === "sync-step2" || msg.t === "update") && msg.update) {
    Y.applyUpdate(msg.doc === "private" ? priv : shared, unb64(msg.update), "remote");
  }
}
const notes = priv.getMap("notesBag").get("body");
if (notes instanceof Y.Text) notes.insert(0, "SENTINEL_PRIVATE_NOTE_zx91");
send(presenter.ws, { t: "update", doc: "private", update: b64(Y.encodeStateAsUpdate(priv)) });
await new Promise((resolve) => setTimeout(resolve, 300));
const hidden = client.frames.map(inflate).join("\n");
check("client socket hides the private note", !hidden.includes("SENTINEL_PRIVATE_NOTE_zx91"));
presenter.ws.close();
client.ws.close();

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
const presenterContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const presenterPage = await presenterContext.newPage();
const clientPage = await clientContext.newPage();
const consoleErrors = [];
for (const page of [presenterPage, clientPage]) {
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
}
await presenterPage.goto(`${base}/app/login`);
await presenterPage.fill("#email", "admin@botlane.io");
await presenterPage.fill("#password", password);
await presenterPage.getByRole("button", { name: "Continue" }).click();
await presenterPage.waitForURL("**/app");
await presenterPage.getByRole("button", { name: /Enquiry to dispatch/ }).click();
await presenterPage.waitForURL("**/app/s/**");
await presenterPage.getByLabel("Company").fill("Sample Metals");
await presenterPage.getByLabel("Company").blur();
await presenterPage.getByRole("button", { name: "Re-keyed between tools" }).first().click();
const joinUrl = await presenterPage.locator("a", { hasText: "Open the client link" }).getAttribute("href");
await clientPage.goto(joinUrl);
await clientPage.getByLabel("Your first name").fill("Ravi");
await clientPage.getByRole("button", { name: "Continue" }).click();
await clientPage.getByLabel("Company").waitFor();
await presenterPage.getByRole("button", { name: "Play the reveal" }).click();
await clientPage.getByRole("heading", { name: /With botLane/ }).waitFor({ timeout: 8000 });
await presenterPage.getByRole("heading", { name: /With botLane/ }).scrollIntoViewIfNeeded();
await presenterPage.screenshot({ path: `${artifacts}/reveal-presenter.png` });
await clientPage.screenshot({ path: `${artifacts}/reveal-client.png` });
const summaryUrl = await presenterPage.evaluate(async () => {
  const res = await fetch(location.pathname.replace("/app/s/", "/api/presenter/sessions/"));
  const body = await res.json();
  return body.summaryUrl;
});
const summaryPage = await browser.newPage({ viewport: { width: 900, height: 1100 } });
summaryPage.on("pageerror", (error) => consoleErrors.push(String(error)));
await summaryPage.goto(summaryUrl);
await summaryPage.getByRole("heading", { level: 1 }).waitFor();
const heading = await summaryPage.getByRole("heading", { level: 1 }).innerText();
check("summary page shows the company", heading.includes("Sample Metals"), heading);
await summaryPage.screenshot({ path: `${artifacts}/summary-page.png`, fullPage: true });
const htmlPage = await browser.newPage({ viewport: { width: 800, height: 1000 } });
await htmlPage.goto(summaryUrl.replace("/s/", "/api/summary/") + "/html");
await htmlPage.screenshot({ path: `${artifacts}/summary-print.png`, fullPage: true });
await presenterPage.goto(`${base}/app/library`);
await presenterPage.getByRole("heading", { name: /Process library/ }).waitFor();
await presenterPage.screenshot({ path: `${artifacts}/library-admin.png`, fullPage: true });
check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();

async function lighthouse(url, name) {
  const out = `/tmp/lh-${name}.json`;
  const child = spawn("npx", ["--yes", "lighthouse", url, "--only-categories=accessibility", "--quiet", "--chrome-flags=--headless --no-sandbox", "--output=json", `--output-path=${out}`], { stdio: "inherit" });
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) {
    check(`lighthouse ${name}`, false, "failed to run");
    return;
  }
  const report = JSON.parse(readFileSync(out, "utf8"));
  const score = Math.round(report.categories.accessibility.score * 100);
  check(`lighthouse ${name} >= 95`, score >= 95, String(score));
}
await lighthouse(`${created.joinUrl}?n=Ravi`, "client");
await lighthouse(summaryUrl, "summary");

if (failures.length) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Phase 2 checks passed");
