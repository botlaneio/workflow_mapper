import { useEffect } from "react";
import * as Y from "yjs";
import type { PrivateSnap, SharedSnap } from "@shared/doc";
import { setOverride, setPainArea, toggleAsked } from "@shared/doc";
import type { Catalog } from "@shared/types";
import { YTextField } from "../lib/YText";

export function PrivatePanel({
  snap,
  priv,
  doc,
  catalog,
  ready,
}: {
  snap: SharedSnap;
  priv: PrivateSnap;
  doc: Y.Doc;
  catalog: Catalog;
  ready: boolean;
}) {
  useEffect(() => {
    if (!ready) return;
    const notes = doc.getMap("stepNotes");
    doc.transact(() => {
      for (const step of snap.steps) {
        if (!(notes.get(step.id) instanceof Y.Text)) notes.set(step.id, new Y.Text());
      }
    });
  }, [ready, doc, snap.steps.map((step) => step.id).join("|")]);

  return (
    <div className="stack">
      <section className="panel" aria-labelledby="notesTitle">
        <h2 id="notesTitle">Private notes. <span>Only the botLane team.</span></h2>
        <label className="f" htmlFor="session-notes">Session notes
          <YTextField id="session-notes" ytext={priv.notes} multiline focusKey="private:notes" />
        </label>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <Tag label="Deal size guess" id="tag-deal" ytext={priv.tags.dealSize} />
          <Tag label="Urgency" id="tag-urgency" ytext={priv.tags.urgency} />
          <Tag label="Decision maker" id="tag-decision" ytext={priv.tags.decisionMaker} />
          <Tag label="Pricing hint" id="tag-price" ytext={priv.tags.pricingHint} />
        </div>
      </section>
      <section className="panel" aria-labelledby="qTitle">
        <h2 id="qTitle">Questions to ask.</h2>
        <ul className="qs">
          {priv.questions.map((question, index) => {
            const asked = priv.asked.includes(index);
            return (
              <li key={question} className={asked ? "done" : ""}>
                <input id={`q-${index}`} type="checkbox" checked={asked} onChange={() => toggleAsked(doc, index)} />
                <label htmlFor={`q-${index}`}>{question}</label>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="panel" aria-labelledby="mapTitle">
        <h2 id="solutionTitle">Solution mapping. <span>Hidden from the client.</span></h2>
        {snap.steps.map((step, index) => {
          const note = doc.share.has("stepNotes") ? doc.getMap("stepNotes").get(step.id) : null;
          return (
            <div key={step.id} className="stack" style={{ marginTop: 12 }}>
              <div className="hint">Step {index + 1}: {step.title || "Untitled step"}</div>
              <label className="f" htmlFor={`area-${step.id}`}>Solution area
                <select
                  id={`area-${step.id}`}
                  value={priv.overrides[step.id] ?? ""}
                  onChange={(event) => setOverride(doc, step.id, event.target.value)}
                >
                  <option value="">Auto from the first flag</option>
                  {catalog.areaOrder.map((key) => <option key={key} value={key}>{catalog.areas[key].name}</option>)}
                </select>
              </label>
              {note instanceof Y.Text ? (
                <label className="f" htmlFor={`snote-${step.id}`}>Private note
                  <YTextField id={`snote-${step.id}`} ytext={note} focusKey={`private:${step.id}`} />
                </label>
              ) : null}
            </div>
          );
        })}
        {snap.pains.map((pain) => (
          <label key={pain.id} className="f" htmlFor={`pain-area-${pain.id}`} style={{ marginTop: 12 }}>
            Area for “{pain.text || "pain point"}”
            <select id={`pain-area-${pain.id}`} value={priv.painAreas[pain.id] ?? ""} onChange={(event) => setPainArea(doc, pain.id, event.target.value)}>
              <option value="">Not grouped</option>
              {catalog.areaOrder.map((key) => <option key={key} value={key}>{catalog.areas[key].name}</option>)}
            </select>
          </label>
        ))}
      </section>
    </div>
  );
}

function Tag({ label, id, ytext }: { label: string; id: string; ytext: Y.Text }) {
  return (
    <label className="f" htmlFor={id}>{label}
      <YTextField id={id} ytext={ytext} focusKey={`private:${id}`} />
    </label>
  );
}
