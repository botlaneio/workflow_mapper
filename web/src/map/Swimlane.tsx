import { useEffect, useRef, useState } from "react";
import type { StepSnap, RoleSnap } from "@shared/doc";
import { formatMinutes, positive, waitHours } from "@shared/format";
import type { WaitUnit } from "@shared/types";
import { BrandMark } from "../lib/brands";
import { Icon, toolIcon } from "../lib/icons";

const G = { labelW: 150, colW: 236, cardW: 176, cardH: 78, laneH: 104, pad: 20 };

export function Swimlane({
  steps,
  roles,
  selectedId,
  onSelect,
  areaColor,
  flagStyle,
  focusNames,
  fresh,
  reveal,
}: {
  steps: StepSnap[];
  roles: RoleSnap[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  areaColor?: (step: StepSnap) => string;
  flagStyle: (flag: string) => { icon: string; label: string; color?: string };
  focusNames?: Record<string, { name: string; color: string }>;
  fresh?: Set<string>;
  reveal?: { phase: "today" | "after"; litIds: string[] };
}) {
  if (!steps.length) {
    return <div className="scroller"><p className="hint" style={{ padding: 32, textAlign: "center" }}>No steps yet. Add the first step as the client describes it.</p></div>;
  }
  const lanes = roles.slice();
  const known = new Set(lanes.map((role) => role.id));
  if (steps.some((step) => !known.has(step.roleId))) lanes.push({ id: "__none", name: "Not assigned", nameText: steps[0]!.titleText });
  const laneIndex = (id: string) => {
    const index = lanes.findIndex((role) => role.id === id);
    return index < 0 ? lanes.length - 1 : index;
  };
  const width = G.labelW + G.pad * 2 + (steps.length - 1) * G.colW + G.cardW;
  const height = lanes.length * G.laneH;
  const pos = steps.map((step, index) => ({
    x: G.labelW + G.pad + index * G.colW,
    y: laneIndex(step.roleId) * G.laneH + (G.laneH - G.cardH) / 2,
  }));
  const counts: Record<number, number> = {};
  steps.forEach((step) => {
    const lane = laneIndex(step.roleId);
    counts[lane] = (counts[lane] ?? 0) + 1;
  });
  const wires: { d: string; slow: boolean }[] = [];
  const pills: { left: number; top: number; label: string; slow: boolean; shrink?: boolean }[] = [];
  for (let i = 0; i < pos.length - 1; i++) {
    const a = pos[i]!;
    const b = pos[i + 1]!;
    const x1 = a.x + G.cardW;
    const y1 = a.y + G.cardH / 2;
    const x2 = b.x - 2;
    const y2 = b.y + G.cardH / 2;
    const mid = x1 + (x2 - x1) / 2;
    const wait = waitHours(steps[i]!.waitValue, steps[i]!.waitUnit as WaitUnit);
    const slow = wait >= 4;
    const d = y1 === y2
      ? `M${x1} ${y1} H${x2}`
      : `M${x1} ${y1} H${mid - 6} Q${mid} ${y1} ${mid} ${y1 + Math.sign(y2 - y1) * 6} V${y2 - Math.sign(y2 - y1) * 6} Q${mid} ${y2} ${mid + 6} ${y2} H${x2}`;
    wires.push({ d, slow });
    const shrink = reveal?.phase === "after" && steps[i]!.flags.length > 0;
    if (wait > 0) pills.push({ left: mid, top: (y1 + y2) / 2, label: formatMinutes(wait * 60), slow: slow && !shrink, shrink });
  }
  return (
    <div className="scroller" tabIndex={0} aria-label="Process map. Scroll sideways for more steps.">
      <div className="lanes" style={{ width, ["--laneh" as string]: `${G.laneH}px`, ["--labelw" as string]: `${G.labelW}px`, ["--cardw" as string]: `${G.cardW}px`, ["--cardh" as string]: `${G.cardH}px` }}>
        {lanes.map((role, index) => (
          <div className="lane" key={role.id}>
            <div className="lane-label">
              <b>{role.name || "Unnamed role"}</b>
              <span>{counts[index] ?? 0} step{(counts[index] ?? 0) === 1 ? "" : "s"}</span>
            </div>
          </div>
        ))}
        <svg className="wires" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="#9aabb9" />
            </marker>
          </defs>
          {wires.map((wire, index) => <path key={index} d={wire.d} className={wire.slow ? "slow" : ""} markerEnd="url(#arr)" />)}
        </svg>
        {pills.map((pill, index) => (
          <div key={index} className={`wait${pill.slow ? " slow" : ""}${pill.shrink ? " shrink" : ""}`} style={{ left: pill.left, top: pill.top }}>{pill.label}</div>
        ))}
        {steps.map((step, index) => {
          const color = areaColor?.(step);
          const meta = [step.tool, positive(step.minutes) ? formatMinutes(step.minutes) : ""].filter(Boolean).join(" · ");
          const mark = toolIcon(step.tool);
          const who = focusNames?.[step.id];
          const automated = reveal?.phase === "after" && step.flags.length > 0;
          const lit = reveal?.phase === "after" && reveal.litIds.includes(step.id);
          return (
            <button
              key={step.id}
              type="button"
              className={`card${selectedId === step.id ? " sel" : ""}${fresh?.has(step.id) ? " enter" : ""}${automated ? " auto" : ""}${lit ? " lit" : ""}`}
              style={{ left: pos[index]!.x, top: pos[index]!.y }}
              onClick={() => onSelect?.(step.id)}
              aria-label={`Step ${index + 1}, ${step.title || "Untitled step"}`}
            >
              {color ? <span className="tag" style={{ background: color }} aria-hidden="true" /> : null}
              {who ? <span className="cursor-chip" style={{ ["--c" as string]: who.color, left: 8, top: 0 }}>{who.name}</span> : null}
              <span className="t"><em style={{ color: "var(--muted)", fontStyle: "normal", marginRight: 5 }}>{index + 1}</em>{automated ? "Automated · " : ""}{step.title || "Untitled step"}</span>
              <span className="m">
                <span className="tool" style={{ display: "inline-flex", gap: 4, alignItems: "center", overflow: "hidden" }}>
                  {mark?.startsWith("brand:") ? <BrandMark id={mark.slice(6)} /> : mark ? <Icon name={mark} size={14} /> : null}
                  {meta || "Add tool and time"}
                </span>
                <span className="fl">
                  {step.flags.map((flag) => {
                    const style = flagStyle(flag);
                    return <Icon key={flag} name={style.icon} size={14} label={style.label} />;
                  })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function useFreshIds(ids: string[]): Set<string> {
  const seen = useRef(new Set<string>());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const born = ids.filter((id) => !seen.current.has(id) && seen.current.size > 0);
    ids.forEach((id) => seen.current.add(id));
    if (!born.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setFresh(new Set(born));
    const timer = window.setTimeout(() => setFresh(new Set()), 400);
    return () => window.clearTimeout(timer);
  }, [ids.join("|")]);
  return fresh;
}
