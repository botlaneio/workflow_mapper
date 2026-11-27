import { chromium } from "playwright-core";
import * as Y from "yjs";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

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

function b64(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}
function unb64(value) {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function inflate(frame) {
  const parts = [frame];
  for (const match of frame.match(/[A-Za-z0-9+/]{16,}={0,2}/g) || []) {
    try {
      parts.push(Buffer.from(match, "base64").toString("utf8"));
    } catch {
      /* not text */
    }
  }
  return parts.join("\n");
}

const failures = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

const login = await fetch(`${base}/api/auth/dev-login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: "admin@botlane.io", password }),
});
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
check("dev login", login.ok);
const created = await (await fetch(`${base}/api/presenter/sessions`, {
  method: "POST",
  headers: { cookie, "content-type": "application/json", origin: base },
  body: JSON.stringify({ templateId: "mfg-enquiry-to-dispatch" }),
})).json();
const token = new URL(created.joinUrl).pathname.split("/").pop();
const wsBase = base.replace(/^http/, "ws");

function openSocket(url, headers) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const frames = [];
    ws.addEventListener("message", (event) => frames.push(String(event.data)));
    ws.addEventListener("open", () => resolve({ ws, frames }));
    ws.addEventListener("error", () => reject(new Error("socket failed")));
  });
}

const presenter = await openSocket(`${wsBase}/api/room/${created.id}/ws`, { cookie });
const client = await openSocket(`${wsBase}/api/room/${created.id}/ws?token=${encodeURIComponent(token)}`);
const shared = new Y.Doc();
const priv = new Y.Doc();
const clientDoc = new Y.Doc();
const send = (ws, message) => ws.send(JSON.stringify(message));
send(presenter.ws, { t: "hello", name: "Solo" });
send(presenter.ws, { t: "sync-step1", doc: "shared", sv: b64(Y.encodeStateVector(shared)) });
send(presenter.ws, { t: "sync-step1", doc: "private", sv: b64(Y.encodeStateVector(priv)) });
send(client.ws, { t: "hello", name: "Ravi", clientId: "abcdef1234567890" });
send(client.ws, { t: "sync-step1", doc: "shared", sv: b64(Y.encodeStateVector(clientDoc)) });
send(client.ws, { t: "sync-step1", doc: "private", sv: b64(Y.encodeStateVector(new Y.Doc())) });
await new Promise((resolve) => setTimeout(resolve, 300));

function absorb(doc, frames, which) {
  for (const raw of frames) {
    const msg = JSON.parse(raw);
    if ((msg.t === "sync-step2" || msg.t === "update") && msg.doc === which) Y.applyUpdate(doc, unb64(msg.update), "remote");
  }
}
absorb(shared, presenter.frames, "shared");
absorb(priv, presenter.frames, "private");
absorb(clientDoc, client.frames, "shared");
check("shared map reached the client", clientDoc.getArray("stepOrder").length === 9, String(clientDoc.getArray("stepOrder").length));
check("presenter received discovery questions", priv.getArray("questions").length === 7);

const sessionNotes = priv.getMap("notesBag").get("body");
if (sessionNotes instanceof Y.Text) sessionNotes.insert(0, "SENTINEL_PRIVATE_NOTE_zx91");
const hint = priv.getMap("tags").get("pricingHint");
if (hint instanceof Y.Text) hint.insert(0, "SENTINEL_PRICE_HINT_qq");
send(presenter.ws, { t: "update", doc: "private", update: b64(Y.encodeStateAsUpdate(priv)) });
const order = shared.getArray("stepOrder").toArray();
const step = shared.getMap("steps").get(order[4]);
step.set("minutes", 50);
step.get("flags").set("rekey", true);
shared.getMap("intake").set("runsPerWeek", 7);
const started = performance.now();
const marker = `LAT${Date.now().toString(36)}`;
shared.getMap("client").get("company").insert(0, marker);
send(presenter.ws, { t: "update", doc: "shared", update: b64(Y.encodeStateAsUpdate(shared)) });
send(client.ws, { t: "set-flag", key: "showEstimates", value: true });
let latency = null;
const waitUntil = Date.now() + 2000;
while (Date.now() < waitUntil) {
  const hit = client.frames.map(inflate).some((frame) => frame.includes(marker));
  if (hit) {
    latency = performance.now() - started;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
}
check("edit reached the client", latency !== null);
check("edit arrived in under 300ms", latency !== null && latency < 300, latency === null ? "timeout" : `${Math.round(latency)}ms`);
const hidden = client.frames.map(inflate).join("\n");
for (const needle of ["SENTINEL_PRIVATE_NOTE_zx91", "SENTINEL_PRICE_HINT_qq", "areaOverrides", "pricingHint", "pass warm ones", "What breaks when the person", "h/week"]) {
  check(`hidden from client: ${needle}`, !hidden.includes(needle));
}
send(presenter.ws, { t: "set-flag", key: "showEstimates", value: true });
await new Promise((resolve) => setTimeout(resolve, 300));
const revealed = client.frames.map(inflate).join("\n");
check("revealed hours reach the client", revealed.includes("h/week"));
check("reveal still hides the private note", !revealed.includes("SENTINEL_PRIVATE_NOTE_zx91"));
check("reveal still hides the suggested fix", !revealed.includes("Connect the tools"));
presenter.ws.close();
client.ws.close();

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
const presenterContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const presenterPage = await presenterContext.newPage();
const clientPage = await clientContext.newPage();
const consoleErrors = [];
for (const page of [presenterPage, clientPage]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
}
const clientFrames = [];
clientPage.on("websocket", (socket) => {
  socket.on("framereceived", (frame) => clientFrames.push(String(frame.payload)));
});
await presenterPage.goto(`${base}/app/login`);
await presenterPage.fill("#email", "admin@botlane.io");
await presenterPage.fill("#password", password);
await presenterPage.getByRole("button", { name: "Continue" }).click();
await presenterPage.waitForURL("**/app");
await presenterPage.getByRole("button", { name: /Enquiry to dispatch/ }).click();
await presenterPage.waitForURL("**/app/s/**");
const joinText = await presenterPage.locator(".join-code").innerText();
check("presenter shows a say-aloud code", /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(joinText.trim()), joinText);
const joinUrl = await presenterPage.locator("a", { hasText: "Open the client link" }).getAttribute("href");
await clientPage.goto(joinUrl);
await clientPage.getByLabel("Your first name").fill("Ravi");
await clientPage.getByRole("button", { name: "Continue" }).click();
await clientPage.getByLabel("Company").waitFor();
const company = presenterPage.getByLabel("Company");
await company.click();
await company.fill("");
await Promise.all([
  company.pressSequentially("QQQ", { delay: 30 }),
  clientPage.getByLabel("Company").pressSequentially("ZZZ", { delay: 30 }),
]);
await presenterPage.waitForFunction(() => {
  const value = document.getElementById("f-field:company")?.value || "";
  return value.includes("Q") && value.includes("Z") && (value.match(/Q/g) || []).length >= 3 && (value.match(/Z/g) || []).length >= 3;
}, null, { timeout: 8000 });
const merged = await company.inputValue();
const clientMerged = await clientPage.getByLabel("Company").inputValue();
check("concurrent typing did not drop characters", merged === clientMerged && (merged.match(/Q/g) || []).length >= 3 && (merged.match(/Z/g) || []).length >= 3, merged);
await presenterPage.getByLabel("Session notes").fill("SENTINEL_PRIVATE_NOTE_zx91");
await presenterPage.getByLabel("Pricing hint").fill("SENTINEL_PRICE_HINT_qq");
await presenterPage.waitForTimeout(400);
const browserFrames = clientFrames.map(inflate).join("\n");
check("browser client frames hide the private note", !browserFrames.includes("SENTINEL_PRIVATE_NOTE_zx91"));
check("browser client frames hide the pricing hint", !browserFrames.includes("SENTINEL_PRICE_HINT_qq"));
await presenterPage.screenshot({ path: `${artifacts}/presenter-view.png`, fullPage: false });
await clientPage.screenshot({ path: `${artifacts}/client-view.png`, fullPage: false });
const presenterShot = readFileSync(`${artifacts}/presenter-view.png`).toString("base64");
const clientShot = readFileSync(`${artifacts}/client-view.png`).toString("base64");
const board = await browser.newPage({ viewport: { width: 1720, height: 980 } });
await board.setContent(`<!doctype html><html><body style="margin:0;background:#f6f8fa;font-family:Arial">
<div style="display:flex;gap:16px;padding:16px">
<figure style="margin:0"><figcaption style="font-weight:600;margin-bottom:8px">Presenter</figcaption><img src="data:image/png;base64,${presenterShot}" width="1280" style="width:1100px;height:auto;border:1px solid #e3e8ed;background:#fff"></figure>
<figure style="margin:0"><figcaption style="font-weight:600;margin-bottom:8px">Client</figcaption><img src="data:image/png;base64,${clientShot}" width="390" style="width:390px;height:auto;border:1px solid #e3e8ed;background:#fff"></figure>
</div></body></html>`);
await board.screenshot({ path: `${artifacts}/presenter-and-client.png` });
check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "));
await browser.close();

const { spawn } = await import("node:child_process");
const lhPath = "/tmp/lighthouse-client.json";
const lh = spawn("npx", ["--yes", "lighthouse", `${created.joinUrl}?n=Ravi`, "--only-categories=accessibility", "--quiet", "--chrome-flags=--headless --no-sandbox", "--output=json", `--output-path=${lhPath}`], { stdio: "inherit" });
const lhCode = await new Promise((resolve) => lh.on("close", resolve));
if (lhCode === 0) {
  const report = JSON.parse(readFileSync(lhPath, "utf8"));
  const score = Math.round(report.categories.accessibility.score * 100);
  writeFileSync(`${artifacts}/lighthouse-accessibility.json`, JSON.stringify({ score, url: "client session" }, null, 2));
  check("lighthouse accessibility >= 95", score >= 95, String(score));
} else {
  check("lighthouse accessibility >= 95", false, "lighthouse failed to run");
}

if (failures.length) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Phase 1 checks passed");
