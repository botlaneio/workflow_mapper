import { ESTIMATE_NOTE, type AreaKey, type Catalog, type RevealedEstimates } from "./types";
import { formatHourEstimate, positive } from "./format";

export interface EstimateStep {
  id: string;
  title: string;
  minutes: number;
  waitHours: number;
  flags: string[];
  roleName: string;
  index: number;
}

export interface OpportunityItem {
  stepId: string;
  index: number;
  title: string;
  hours: number;
  waitHours: number;
  flags: string[];
  fixes: string[];
  roleName: string;
}

export interface OpportunityGroup {
  area: AreaKey;
  name: string;
  icon: string;
  tint: string;
  tone: string;
  hours: number;
  items: OpportunityItem[];
  pains: string[];
}

export interface OpportunityModel {
  totalHours: number;
  ranked: OpportunityItem[];
  groups: OpportunityGroup[];
  unassignedPains: string[];
}

export function stepHoursPerWeek(minutes: number, runsPerWeek: number, flags: string[], catalog: Catalog): number {
  if (!flags.length) return 0;
  const mins = positive(minutes);
  const runs = positive(runsPerWeek);
  if (!mins || !runs) return 0;
  const factor = Math.max(...flags.map((key) => catalog.flags[key as keyof Catalog["flags"]]?.factor ?? 0));
  return (mins * runs) / 60 * factor;
}

export function stepArea(flags: string[], override: string | undefined, catalog: Catalog): AreaKey | "" {
  if (override && catalog.areas[override as AreaKey]) return override as AreaKey;
  for (const key of catalog.flagOrder) {
    if (flags.includes(key)) return catalog.flags[key].area;
  }
  return "";
}

export function buildOpportunities(input: {
  runsPerWeek: number;
  steps: EstimateStep[];
  overrides: Record<string, string>;
  pains: { text: string; area?: string }[];
  catalog: Catalog;
}): OpportunityModel {
  const groups = new Map<AreaKey, OpportunityGroup>();
  const ensure = (area: AreaKey) => {
    let group = groups.get(area);
    if (!group) {
      const def = input.catalog.areas[area];
      group = {
        area,
        name: def.name,
        icon: def.icon,
        tint: def.tint,
        tone: def.tone,
        hours: 0,
        items: [],
        pains: [],
      };
      groups.set(area, group);
    }
    return group;
  };

  for (const step of input.steps) {
    if (!step.flags.length) continue;
    const area = stepArea(step.flags, input.overrides[step.id], input.catalog);
    if (!area) continue;
    const hours = stepHoursPerWeek(step.minutes, input.runsPerWeek, step.flags, input.catalog);
    const group = ensure(area);
    group.hours += hours;
    const fixes = [...new Set(step.flags.map((key) => input.catalog.flags[key as keyof Catalog["flags"]]?.fix).filter(Boolean))] as string[];
    group.items.push({
      stepId: step.id,
      index: step.index,
      title: step.title || "Untitled step",
      hours,
      waitHours: step.waitHours,
      flags: step.flags,
      fixes,
      roleName: step.roleName,
    });
  }

  for (const pain of input.pains) {
    const text = pain.text.trim();
    if (!text) continue;
    if (pain.area && input.catalog.areas[pain.area as AreaKey]) {
      ensure(pain.area as AreaKey).pains.push(text);
    }
  }

  const unassigned = input.pains
    .filter((pain) => pain.text.trim() && !(pain.area && input.catalog.areas[pain.area as AreaKey]))
    .map((pain) => pain.text.trim());
  const ranked = [...groups.values()]
    .flatMap((group) => group.items)
    .sort((a, b) => b.hours - a.hours || b.waitHours - a.waitHours)
    .slice(0, 3);
  const ordered = input.catalog.areaOrder.map((key) => groups.get(key)).filter((group): group is OpportunityGroup => Boolean(group));
  const totalHours = ordered.reduce((sum, group) => sum + group.hours, 0);
  return { totalHours, ranked, groups: ordered, unassignedPains: unique(unassigned) };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function toRevealed(model: OpportunityModel): RevealedEstimates {
  return {
    total: formatHourEstimate(model.totalHours),
    note: ESTIMATE_NOTE,
    top: model.ranked
      .filter((item) => item.hours > 0)
      .map((item) => ({ title: item.title, hours: formatHourEstimate(item.hours) })),
    areas: model.groups
      .filter((group) => group.hours > 0)
      .map((group) => ({ name: group.name, hours: formatHourEstimate(group.hours) })),
  };
}
