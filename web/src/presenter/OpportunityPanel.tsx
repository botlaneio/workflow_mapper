import type { Catalog } from "@shared/types";
import { ESTIMATE_NOTE } from "@shared/types";
import { formatHourEstimate, formatMinutes } from "@shared/format";
import type { OpportunityModel } from "@shared/estimate";
import { Icon } from "../lib/icons";

export function OpportunityPanel({ model, runsPerWeek, catalog }: { model: OpportunityModel; runsPerWeek: number; catalog: Catalog }) {
  if (!model.groups.length && !model.unassignedPains.length) {
    return <p className="hint">Flag a problem on a step, such as typed in by hand or waits on approval, and the opportunities group here.</p>;
  }
  return (
    <div>
      {model.ranked.length ? (
        <div className="start">
          <div className="eyebrow">Start with these</div>
          <ol>
            {model.ranked.map((item, index) => (
              <li key={item.stepId}>
                <span className="n">{index + 1}</span>
                <span>{item.title} <span className="hint">({item.roleName})</span></span>
                <span>{runsPerWeek ? formatHourEstimate(item.hours) : item.waitHours ? `cuts ${formatMinutes(item.waitHours * 60)} wait` : ""}</span>
              </li>
            ))}
          </ol>
          {runsPerWeek ? null : <p className="hint">Add runs per week to estimate hours.</p>}
        </div>
      ) : null}
      {model.groups.map((group) => (
        <div className="area" key={group.area} style={{ ["--tone" as string]: group.tone, ["--tint" as string]: group.tint }}>
          <div className="area-h">
            <span className="ico" style={{ background: group.tint, color: group.tone }}><Icon name={group.icon} size={18} /></span>
            {group.name}
            {formatHourEstimate(group.hours) ? <span className="hrs">{formatHourEstimate(group.hours)}</span> : null}
          </div>
          {group.items.map((item) => (
            <div className="opp" key={item.stepId}>
              <b>Step {item.index + 1}: {item.title}</b>
              <span className="hint">
                {item.flags.map((flag) => catalog.flags[flag as keyof Catalog["flags"]]?.label ?? flag).join(", ")}
                {item.waitHours >= 4 ? ` · waits ${formatMinutes(item.waitHours * 60)}` : ""}
              </span>
              {item.fixes.map((fix) => <span key={fix}>→ {fix}</span>)}
            </div>
          ))}
          {group.pains.map((pain) => <div className="quote" key={pain}>“{pain}”</div>)}
        </div>
      ))}
      {model.unassignedPains.length ? (
        <div className="area">
          <div className="eyebrow">In their words</div>
          {model.unassignedPains.map((pain) => <div className="quote" key={pain}>“{pain}”</div>)}
        </div>
      ) : null}
      <p className="hint">{ESTIMATE_NOTE} Hours use hands-on minutes × runs per week × how much of that step automation typically removes.</p>
    </div>
  );
}
