import type { Catalog } from "./types";
import { ESTIMATE_NOTE } from "./types";
import { formatHourEstimate, formatMinutes } from "./format";
import { buildOpportunities, type EstimateStep } from "./estimate";

export function summaryText(input: {
  company: string;
  contact: string;
  contactRole: string;
  city: string;
  product: string;
  teamSize: string;
  processName: string;
  runUnit: string;
  runsPerWeek: number;
  handsMinutes: number;
  waitMinutes: number;
  toolCount: number;
  people: number;
  steps: EstimateStep[];
  stepLines: string[];
  pains: { text: string; area?: string }[];
  whatGood: string;
  overrides: Record<string, string>;
  catalog: Catalog;
}): string {
  const model = buildOpportunities({
    runsPerWeek: input.runsPerWeek,
    steps: input.steps,
    overrides: input.overrides,
    pains: input.pains,
    catalog: input.catalog,
  });
  const unit = input.runUnit || "run";
  const lines: string[] = [];
  lines.push(`Workflow map: ${input.company || "Untitled client"}`);
  lines.push(`Process: ${input.processName || "-"}`);
  if (input.contact || input.contactRole) {
    lines.push(`Contact: ${[input.contact, input.contactRole].filter(Boolean).join(", ")}`);
  }
  const made = [
    input.product ? `Makes: ${input.product}` : "",
    input.city,
    input.teamSize ? `Team: ${input.teamSize}` : "",
  ].filter(Boolean);
  if (made.length) lines.push(made.join(" · "));
  lines.push("");
  lines.push(`${input.steps.length} steps · ${input.people} people · ${input.toolCount} tools`);
  lines.push(
    `Per ${unit}: ${formatMinutes(input.handsMinutes)} hands-on, ${formatMinutes(input.waitMinutes)} waiting, ${formatMinutes(input.handsMinutes + input.waitMinutes)} start to finish`,
  );
  if (input.runsPerWeek > 0 && model.totalHours > 0) {
    lines.push(`Runs per week: ${input.runsPerWeek} · Rough hours recoverable: ${formatHourEstimate(model.totalHours)}`);
  } else if (input.runsPerWeek > 0) {
    lines.push(`Runs per week: ${input.runsPerWeek}`);
  }
  lines.push("");
  lines.push("Current steps:");
  input.stepLines.forEach((line, index) => lines.push(`${index + 1}. ${line}`));
  if (model.ranked.length) {
    lines.push("");
    lines.push("Start with:");
    model.ranked.forEach((item, index) => {
      const hours = formatHourEstimate(item.hours);
      lines.push(`${index + 1}. ${item.title}${hours ? ` (${hours})` : ""}`);
    });
  }
  for (const group of model.groups) {
    lines.push("");
    const hours = formatHourEstimate(group.hours);
    lines.push(`${group.name}${hours ? ` (${hours})` : ""}`);
    for (const item of group.items) {
      const fixes = item.fixes.join(" ");
      lines.push(`- Step ${item.index + 1}, ${item.title}${fixes ? `: ${fixes}` : ""}`);
    }
    for (const pain of group.pains) lines.push(`- Client said: "${pain}"`);
  }
  const loose = model.unassignedPains;
  if (loose.length) {
    lines.push("");
    lines.push("In their words:");
    for (const pain of loose) lines.push(`- "${pain}"`);
  }
  if (input.whatGood.trim()) {
    lines.push("");
    lines.push("If this ran itself:");
    lines.push(input.whatGood.trim());
  }
  lines.push("");
  lines.push(ESTIMATE_NOTE);
  return lines.join("\n");
}
