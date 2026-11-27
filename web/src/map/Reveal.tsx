import { useEffect, useState } from "react";
import type { StepSnap, RoleSnap } from "@shared/doc";
import { ILLUSTRATIVE_NOTE } from "@shared/types";
import { Swimlane } from "./Swimlane";

export function RevealStage({
  steps,
  roles,
  litIds,
  playing,
  flagStyle,
}: {
  steps: StepSnap[];
  roles: RoleSnap[];
  litIds: string[];
  playing: boolean;
  flagStyle: (flag: string) => { icon: string; label: string };
}) {
  const [phase, setPhase] = useState<"today" | "after">("today");
  useEffect(() => {
    if (!playing) {
      setPhase("today");
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("after");
      return;
    }
    setPhase("today");
    const timer = window.setTimeout(() => setPhase("after"), 900);
    return () => window.clearTimeout(timer);
  }, [playing, steps.map((step) => step.id).join("|")]);

  return (
    <section className="panel" aria-labelledby="revealTitle">
      <div className="reveal-caption">
        <h2 id="revealTitle">{phase === "today" ? "Today." : "With botLane."} <span>{phase === "today" ? "The process as you described it." : "Flagged steps become automated, and their waits draw back."}</span></h2>
      </div>
      <Swimlane steps={steps} roles={roles} flagStyle={flagStyle} reveal={playing ? { phase, litIds } : undefined} />
      <p className="hint">{ILLUSTRATIVE_NOTE} Nothing here is a promised result.</p>
    </section>
  );
}
