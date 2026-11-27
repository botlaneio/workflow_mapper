import type { ClientSummary } from "../../shared/src/client-summary";
import type { OrgConfig } from "../../shared/src/types";

export function renderSummaryHtml(summary: ClientSummary, org: Omit<OrgConfig, "team">, expiresAt: string): string {
  const steps = summary.steps.map((step, index) => `<li><strong>${esc(step.title)}</strong> <span class="muted">${esc([step.role, step.tool, step.minutes ? `${step.minutes} min` : "", step.waitLabel ? `then waits ${step.waitLabel}` : ""].filter(Boolean).join(" · "))}${step.flags.length ? ` [${esc(step.flags.join("; "))}]` : ""}</span></li>`).join("");
  const pains = summary.pains.map((pain) => `<blockquote>“${esc(pain)}”</blockquote>`).join("") || `<p class="muted">No pain points were written down.</p>`;
  const noticed = summary.noticed.map((group) => `<section><h3>${esc(group.area)}${group.hours ? ` <span class="hours">${esc(group.hours)}</span>` : ""}</h3><ul>${group.steps.map((step) => `<li>${esc(step.title)}${step.hours ? ` · ${esc(step.hours)}` : ""}</li>`).join("")}</ul></section>`).join("") || `<p class="muted">No flagged steps yet.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${esc(summary.company || "Workflow map")} · ${esc(org.wordmark)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fff; color: #061B31; font: 16px/1.5 "Instrument Sans", Arial, Helvetica, sans-serif; }
  header, main { max-width: 760px; margin: 0 auto; padding: 24px 16px; }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #E3E8ED; }
  img { height: 36px; width: auto; }
  h1 { font-weight: 400; letter-spacing: -0.03em; font-size: 32px; margin: 12px 0; }
  h1 span, .muted { color: #425E73; }
  h2 { font-weight: 400; letter-spacing: -0.03em; font-size: 22px; }
  .hours { color: #5333F5; font-size: 14px; }
  blockquote { margin: 8px 0; padding: 8px 12px; background: #F6F8FA; border-radius: 6px; }
  ol, ul { padding-left: 1.2em; }
  a { color: #061B31; }
  @media print { header { border: 0; } a { text-decoration: none; } }
</style>
</head>
<body>
<header>
  <img src="${esc(org.assets.logoHorizontal)}" alt="${esc(org.wordmark)}">
  <span>${esc(org.productName)}</span>
</header>
<main>
  <p>Workflow map</p>
  <h1>${esc(summary.company || "Untitled client")}. <span>${esc(summary.processName)}</span></h1>
  <p class="muted">${esc([summary.contact, summary.contactRole, summary.city, summary.product].filter(Boolean).join(" · "))}</p>
  <p class="muted">This link expires ${esc(expiresAt)}. ${esc(summary.illustrative)}</p>
  <h2>The steps</h2>
  <ol>${steps}</ol>
  <h2>In their words</h2>
  ${pains}
  ${summary.whatGood ? `<h2>If this ran itself</h2><p>${esc(summary.whatGood)}</p>` : ""}
  <h2>What we noticed</h2>
  ${summary.totalHours ? `<p><strong>${esc(summary.totalHours)}</strong></p>` : ""}
  ${noticed}
  <p class="muted">${esc(summary.note)}</p>
</main>
</body>
</html>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
