import { buildOpportunities } from "./estimate";
import { formatHourEstimate, formatMinutes, positive, waitHours } from "./format";
import { ESTIMATE_NOTE, ILLUSTRATIVE_NOTE, type Catalog, type WaitUnit } from "./types";

export interface ClientSummary {
  company: string;
  contact: string;
  contactRole: string;
  city: string;
  product: string;
  teamSize: string;
  processName: string;
  runUnit: string;
  runsPerWeek: number;
  roles: { name: string }[];
  steps: { title: string; role: string; tool: string; minutes: number; waitLabel: string; flags: string[] }[];
  pains: string[];
  whatGood: string;
  noticed: { area: string; hours: string; steps: { title: string; hours: string }[] }[];
  totalHours: string;
  note: string;
  illustrative: string;
}

export interface SummarySource {
  company: string;
  contact: string;
  contactRole: string;
  city: string;
  product: string;
  teamSize: string;
  processName: string;
  runUnit: string;
  runsPerWeek: number;
  roles: { id: string; name: string }[];
  steps: { id: string; title: string; roleId: string; tool: string; minutes: number; waitValue: number; waitUnit: WaitUnit; flags: string[] }[];
  pains: string[];
  whatGood: string;
  overrides: Record<string, string>;
}

/** Client-safe summary. The return value has no fixes, factors, notes, or tags. */
export function buildClientSummary(source: SummarySource, catalog: Catalog): ClientSummary {
  const roleName = (id: string) => source.roles.find((role) => role.id === id)?.name || "Not assigned";
  const steps = source.steps.map((step, index) => ({
    id: step.id,
    title: step.title || "Untitled step",
    minutes: positive(step.minutes),
    waitHours: index < source.steps.length - 1 ? waitHours(step.waitValue, step.waitUnit) : 0,
    flags: step.flags,
    roleName: roleName(step.roleId),
    index,
  }));
  const model = buildOpportunities({
    runsPerWeek: source.runsPerWeek,
    steps,
    overrides: source.overrides,
    pains: source.pains.map((text) => ({ text })),
    catalog,
  });
  return {
    company: source.company,
    contact: source.contact,
    contactRole: source.contactRole,
    city: source.city,
    product: source.product,
    teamSize: source.teamSize,
    processName: source.processName,
    runUnit: source.runUnit || "run",
    runsPerWeek: positive(source.runsPerWeek),
    roles: source.roles.map((role) => ({ name: role.name || "Unnamed role" })),
    steps: source.steps.map((step, index) => ({
      title: step.title || "Untitled step",
      role: roleName(step.roleId),
      tool: step.tool,
      minutes: positive(step.minutes),
      waitLabel: index < source.steps.length - 1 && waitHours(step.waitValue, step.waitUnit) > 0
        ? formatMinutes(waitHours(step.waitValue, step.waitUnit) * 60)
        : "",
      flags: step.flags.map((flag) => catalog.flags[flag as keyof Catalog["flags"]]?.label ?? flag),
    })),
    pains: source.pains.map((text) => text.trim()).filter(Boolean),
    whatGood: source.whatGood.trim(),
    noticed: model.groups
      .filter((group) => group.hours > 0 || group.items.length > 0)
      .map((group) => ({
        area: group.name,
        hours: formatHourEstimate(group.hours),
        steps: group.items.map((item) => ({ title: item.title, hours: formatHourEstimate(item.hours) })),
      })),
    totalHours: formatHourEstimate(model.totalHours),
    note: ESTIMATE_NOTE,
    illustrative: ILLUSTRATIVE_NOTE,
  };
}

export function clientSummaryText(summary: ClientSummary, summaryUrl = ""): string {
  const lines = [
    `Workflow map: ${summary.company || "Untitled client"}`,
    `Process: ${summary.processName || "-"}`,
    [summary.contact, summary.contactRole, summary.city].filter(Boolean).join(" · "),
    "",
    ...summary.steps.map((step, index) => `${index + 1}. ${step.title} (${[step.role, step.tool, step.minutes ? `${step.minutes} min` : "", step.waitLabel ? `waits ${step.waitLabel}` : ""].filter(Boolean).join(", ")})${step.flags.length ? ` [${step.flags.join("; ")}]` : ""}`),
    "",
    "In their words:",
    ...(summary.pains.length ? summary.pains.map((pain) => `- "${pain}"`) : ["- none written down"]),
  ];
  if (summary.whatGood) lines.push("", "If this ran itself:", summary.whatGood);
  if (summary.noticed.length) {
    lines.push("", "What we noticed:");
    for (const group of summary.noticed) {
      lines.push(`${group.area}${group.hours ? ` (${group.hours})` : ""}`);
      for (const step of group.steps) lines.push(`- ${step.title}${step.hours ? ` ${step.hours}` : ""}`);
    }
  }
  if (summary.totalHours) lines.push("", `Rough hours: ${summary.totalHours}`);
  lines.push("", summary.note, summary.illustrative);
  if (summaryUrl) lines.push("", summaryUrl);
  return lines.filter((line) => line !== undefined).join("\n");
}
