import type { SharedSnap } from "@shared/doc";
import { formatMinutes, positive, waitHours } from "@shared/format";
import type { WaitUnit } from "@shared/types";

export function metricsOf(snap: SharedSnap) {
  let hands = 0;
  let wait = 0;
  const tools = new Set<string>();
  snap.steps.forEach((step, index) => {
    hands += positive(step.minutes);
    if (index < snap.steps.length - 1) wait += waitHours(step.waitValue, step.waitUnit as WaitUnit);
    if (step.tool.trim()) tools.add(step.tool.trim().toLowerCase());
  });
  return { hands, waitMin: wait * 60, tools: tools.size };
}

export function StatsStrip({ snap, recoverable }: { snap: SharedSnap; recoverable?: string }) {
  const metrics = metricsOf(snap);
  const unit = snap.runUnit || "run";
  const cells: [string, string, string?][] = [
    ["Steps", String(snap.steps.length)],
    ["People involved", String(snap.roles.length)],
    ["Tools in use", String(metrics.tools)],
    [`Hands-on time per ${unit}`, formatMinutes(metrics.hands)],
    [`Waiting per ${unit}`, formatMinutes(metrics.waitMin)],
    [`Start to finish per ${unit}`, formatMinutes(metrics.hands + metrics.waitMin)],
  ];
  if (recoverable) cells.push(["Hours recoverable / week", recoverable, "key"]);
  return (
    <div className="stats">
      {cells.map(([label, value, kind]) => (
        <div className={`stat${kind ? " key" : ""}`} key={label}>
          <div className="k">{label}</div>
          <div className="v">{value}</div>
        </div>
      ))}
    </div>
  );
}
