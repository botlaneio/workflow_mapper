import { useEffect, useMemo, useRef, useState } from "react";
import { diffApply } from "@shared/text";
import { useParams } from "react-router-dom";
import { CHANNELS, CHAPTERS, promptCount, questionText } from "@shared/chapters";
import {
  addPain,
  addStep,
  readShared,
  setChapter,
  setFollowMe,
  setRunsPerWeek,
  setStepField,
  toggleFlag,
  toggleKey,
  toggleSelected,
  type SharedSnap,
} from "@shared/doc";
import { PUBLIC_FLAGS } from "@shared/public-catalog";
import { ILLUSTRATIVE_NOTE } from "@shared/types";
import { api } from "../lib/api";
import { Icon } from "../lib/icons";
import { useRoom, type Person } from "../lib/room";
import { YTextField } from "../lib/YText";
import { RevealStage } from "../map/Reveal";
import { StatsStrip } from "../map/StatsStrip";
import { Swimlane, useFreshIds } from "../map/Swimlane";
import { TopBar } from "../shell/TopBar";
import type * as Y from "yjs";

interface JoinMeta {
  id: string;
  code: string;
  processName: string;
  expiresAt: string;
}

interface PublicProcess {
  id: string;
  name: string;
  description: string;
  icon: string;
  sample: boolean;
}

function storedName(code: string): string {
  return sessionStorage.getItem(`wm-name:${code}`) || new URLSearchParams(location.search).get("n") || "";
}

function clientKey(code: string): string {
  const key = `wm-client:${code}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function JoinHelp() {
  const { code = "" } = useParams();
  return (
    <>
      <TopBar />
      <main id="main" className="wrap client-app" style={{ paddingTop: 32 }}>
        <h1>This link is incomplete.</h1>
        <p>Open the full link from the meeting chat. The code {code} is the room name, and it does not open the map on its own.</p>
      </main>
    </>
  );
}

export function ClientRoute() {
  const { code = "", token = "" } = useParams();
  const [meta, setMeta] = useState<JoinMeta | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => storedName(code));
  const [entered, setEntered] = useState(() => Boolean(storedName(code)));

  useEffect(() => {
    document.title = "Join the workshop · botLane";
    api<JoinMeta>(`/api/join/${encodeURIComponent(code)}/${encodeURIComponent(token)}`)
      .then(setMeta)
      .catch((err) => setError(err instanceof Error ? err.message : "This link is not valid or has expired."));
  }, [code, token]);

  if (error) {
    return (
      <>
        <TopBar />
        <main id="main" className="wrap client-app" style={{ paddingTop: 32 }}>
          <h1>This link has ended.</h1>
          <p role="alert">{error}</p>
        </main>
      </>
    );
  }
  if (!meta) return <p className="wrap" role="status">Connecting…</p>;
  if (!entered) {
    return (
      <>
        <TopBar />
        <main id="main" className="wrap client-app" style={{ paddingTop: 28, maxWidth: 640 }}>
          <p className="eyebrow">Workshop · {meta.processName}</p>
          <h1>You're in. <em>What should we call you?</em></h1>
          <form
            className="stack"
            style={{ marginTop: 18 }}
            onSubmit={(event) => {
              event.preventDefault();
              const next = name.trim();
              if (!next) return;
              sessionStorage.setItem(`wm-name:${code}`, next);
              setName(next);
              setEntered(true);
            }}
          >
            <label className="prompt" htmlFor="first-name">Your first name</label>
            <input id="first-name" autoComplete="given-name" value={name} onChange={(event) => setName(event.target.value)} required />
            <button className="btn primary" type="submit">Continue</button>
            <p className="hint">No account. Just your first name, so the team can see who's typing.</p>
          </form>
        </main>
      </>
    );
  }
  return <ClientSession sessionId={meta.id} code={code} token={token} name={name.trim()} />;
}

function ClientSession({ sessionId, code, token, name }: { sessionId: string; code: string; token: string; name: string }) {
  const clientId = useMemo(() => clientKey(code), [code]);
  const [localNav, setLocalNav] = useState<{ chapter: number; prompt: number } | null>(null);
  const [processes, setProcesses] = useState<PublicProcess[]>([]);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const room = useRoom({
    url: `${protocol}//${location.host}/api/room/${sessionId}/ws?token=${encodeURIComponent(token)}`,
    role: "client",
    name,
    clientId,
  });
  const snap = useMemo(() => (room.synced ? readShared(room.shared) : null), [room.shared, room.synced, room.version]);
  const fresh = useFreshIds(snap?.steps.map((step) => step.id) ?? []);

  useEffect(() => {
    api<{ processes: PublicProcess[] }>("/api/public/processes").then((body) => setProcesses(body.processes)).catch(() => setProcesses([]));
  }, []);

  useEffect(() => {
    if (snap?.client.company) document.title = `${snap.client.company} · botLane`;
  }, [snap?.client.company]);

  const seededName = useRef(false);
  useEffect(() => {
    if (!snap || seededName.current) return;
    seededName.current = true;
    if (!snap.client.contact) diffApply(snap.clientText.contact, name);
  }, [snap, name]);

  const chapter = snap ? (snap.followMe ? snap.chapter : localNav?.chapter ?? snap.chapter) : 1;
  const prompt = snap ? (snap.followMe ? snap.prompt : localNav?.prompt ?? snap.prompt) : 0;

  function move(delta: number) {
    if (!snap) return;
    const count = promptCount(chapter, snap.steps.length);
    let nextChapter = chapter;
    let nextPrompt = prompt + delta;
    if (nextPrompt >= count) {
      nextChapter = Math.min(5, chapter + 1);
      nextPrompt = 0;
    } else if (nextPrompt < 0) {
      nextChapter = Math.max(1, chapter - 1);
      nextPrompt = promptCount(nextChapter, snap.steps.length) - 1;
    }
    if (snap.followMe) setChapter(room.shared, nextChapter, nextPrompt);
    else setLocalNav({ chapter: nextChapter, prompt: nextPrompt });
  }

  const selfId = `guest_${clientId}`;
  const editing = room.people.find((person) => person.id !== selfId && person.focus.startsWith("step:"));
  const editingIndex = editing && snap ? snap.steps.findIndex((step) => step.id === editing.focus.slice(5)) : -1;

  return (
    <div className="client-app">
      <TopBar status={room.status} people={room.people} />
      <main id="main" className="wrap" style={{ paddingTop: 12 }} onFocusCapture={(event) => {
        const holder = (event.target as HTMLElement).closest("[data-focus]");
        room.sendFocus(holder?.getAttribute("data-focus") ?? "");
      }}>
        <div className="rail" aria-label="Progress">
          {CHAPTERS.map((item) => (
            <button key={item.id} type="button" aria-label={item.title} aria-current={chapter === item.id ? "step" : undefined} onClick={() => (snap?.followMe ? setChapter(room.shared, item.id, 0) : setLocalNav({ chapter: item.id, prompt: 0 }))}>
              {item.id}
            </button>
          ))}
        </div>
        <p className="eyebrow">{CHAPTERS[chapter - 1]?.title}</p>
        {editing && editingIndex >= 0 ? <p className="banner" role="status">{editing.name} is editing step {editingIndex + 1}</p> : null}
        <label className="switch">
          <input type="checkbox" checked={snap?.followMe ?? true} disabled={!snap} onChange={(event) => { setFollowMe(room.shared, event.target.checked); if (event.target.checked) setLocalNav(null); }} />
          Follow the presenter
        </label>
        {!snap ? (
          <>
            <h1 className="prompt" id="question">What's the company called?</h1>
            <label className="f" htmlFor="company-waiting">Company
              <input id="company-waiting" disabled />
            </label>
            <p role="status">Connecting… Your answers stay on this device until the link is back.</p>
          </>
        ) : (
          <ChapterBody
            snap={snap}
            doc={room.shared}
            chapter={chapter}
            prompt={prompt}
            processes={processes}
            fresh={fresh}
            people={room.people}
            revealed={room.revealed}
            showEstimates={room.showEstimates}
            reveal={snap.reveal}
            litIds={snap.steps.filter((step) => room.spotlight.includes(step.title)).map((step) => step.id)}
            selfName={name}
          />
        )}
        <div className="q-nav">
          <button className="btn" type="button" onClick={() => move(-1)} disabled={!snap || (chapter === 1 && prompt === 0)}>
            <Icon name="chevron-left" />Back
          </button>
          <button className="btn primary" type="button" onClick={() => move(1)} disabled={!snap || chapter === 5}>
            Next<Icon name="chevron-right" />
          </button>
        </div>
      </main>
    </div>
  );
}

function ChapterBody({
  snap,
  doc,
  chapter,
  prompt,
  processes,
  fresh,
  people,
  revealed,
  showEstimates,
  reveal,
  litIds,
  selfName,
}: {
  snap: SharedSnap;
  doc: Y.Doc;
  chapter: number;
  prompt: number;
  processes: PublicProcess[];
  fresh: Set<string>;
  people: Person[];
  revealed: { total: string; note: string; top: { title: string; hours: string }[]; areas: { name: string; hours: string }[] } | null;
  showEstimates: boolean;
  reveal: boolean;
  litIds: string[];
  selfName: string;
}) {
  const step = snap.steps[prompt];
  const question = questionText(chapter, prompt, chapter === 3 || chapter === 4 ? step?.title : undefined);
  const showMap = chapter >= 3;
  return (
    <>
      <h1 className="prompt" id="question">{question}</h1>
      {chapter === 1 && prompt === 0 ? <Bound label="Company" ytext={snap.clientText.company} focusKey="field:company" /> : null}
      {chapter === 1 && prompt === 1 ? <Bound label="What you make" ytext={snap.clientText.product} focusKey="field:product" /> : null}
      {chapter === 1 && prompt === 2 ? <Bound label="City" ytext={snap.clientText.city} focusKey="field:city" /> : null}
      {chapter === 1 && prompt === 3 ? <Bound label="Team size" ytext={snap.clientText.teamSize} focusKey="field:team" /> : null}
      {chapter === 1 && prompt === 4 ? (
        <>
          <p className="hint">Nice to meet you, {selfName}.</p>
          <Bound label="Your role" ytext={snap.clientText.contactRole} focusKey="field:role" />
        </>
      ) : null}
      {chapter === 1 && prompt === 5 ? (
        <div className="choices" role="group" aria-labelledby="question">
          <span className="badge">Sample</span>
          {processes.map((process) => {
            const on = snap.selected.includes(process.id);
            return (
              <button key={process.id} type="button" className={`choice${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleSelected(doc, process.id)}>
                <Icon name={process.icon} />
                <span><b>{process.name}</b><span className="hint" style={{ display: "block" }}>{process.description}</span></span>
              </button>
            );
          })}
        </div>
      ) : null}
      {chapter === 2 && prompt === 0 ? (
        <div className="choices" role="group" aria-labelledby="question">
          {CHANNELS.map((channel) => {
            const on = snap.channels.includes(channel.id);
            return <button key={channel.id} type="button" className={`choice${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleKey(snap.channelMap, channel.id)}>{channel.label}</button>;
          })}
          <Bound label="Somewhere else" ytext={snap.otherChannelText} focusKey="field:other" />
        </div>
      ) : null}
      {chapter === 2 && prompt === 1 ? (
        <label className="f" htmlFor="runs">How many a week
          <input id="runs" inputMode="numeric" value={snap.runsPerWeek || ""} onChange={(event) => setRunsPerWeek(doc, Number(event.target.value))} />
        </label>
      ) : null}
      {chapter === 2 && prompt === 2 ? <Bound label="After hours" ytext={snap.afterHoursText} focusKey="field:after" /> : null}
      {chapter === 3 && step ? <StepFields snap={snap} stepId={step.id} doc={doc} /> : null}
      {chapter === 3 && !step ? (
        <button className="btn primary" type="button" onClick={() => addStep(doc, snap.roles[0]?.id ?? "")}>Add the first step</button>
      ) : null}
      {chapter === 3 && prompt >= snap.steps.length && snap.steps.length > 0 ? (
        <button className="btn" type="button" onClick={() => addStep(doc, snap.steps.at(-1)?.roleId || snap.roles[0]?.id || "")}>Add another step</button>
      ) : null}
      {chapter === 4 && step ? (
        <div className="stack">
          <p className="hint">{step.title || "This step"}</p>
          <div className="choices" role="group" aria-label="What slows this step down">
            {PUBLIC_FLAGS.map((flag) => {
              const on = step.flags.includes(flag.key);
              return (
                <button key={flag.key} type="button" className={`choice${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleFlag(doc, step.id, flag.key)}>
                  <Icon name={flag.icon} />{flag.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {chapter === 4 && prompt >= snap.steps.length ? <PainComposer snap={snap} doc={doc} by={selfName} /> : null}
      {chapter === 5 ? (
        <div className="stack">
          <Bound label="What would change" ytext={snap.whatGoodText} focusKey="field:good" multiline />
        </div>
      ) : null}
      {showEstimates && revealed ? <RevealedSummary revealed={revealed} /> : null}
      {reveal ? (
        <RevealStage playing steps={snap.steps} roles={snap.roles} litIds={litIds} flagStyle={(flag) => {
          const def = PUBLIC_FLAGS.find((item) => item.key === flag);
          return { icon: def?.icon ?? "circle", label: def?.label ?? flag };
        }} />
      ) : null}
      {showMap && !reveal ? (
        <>
          <StatsStrip snap={snap} recoverable={showEstimates && revealed?.total ? revealed.total : undefined} />
          <div style={{ marginTop: 16 }}>
            <Swimlane
              steps={snap.steps}
              roles={snap.roles}
              fresh={fresh}
              selectedId={chapter === 3 || chapter === 4 ? step?.id : undefined}
              onSelect={(id) => {
                const index = snap.steps.findIndex((item) => item.id === id);
                if (index >= 0) setChapter(doc, chapter, index);
              }}
              flagStyle={(flag) => {
                const def = PUBLIC_FLAGS.find((item) => item.key === flag);
                return { icon: def?.icon ?? "circle", label: def?.label ?? flag };
              }}
              focusNames={Object.fromEntries(people.filter((person) => person.focus.startsWith("step:")).map((person) => [person.focus.slice(5), { name: person.name, color: person.color }]))}
            />
            <p className="hint">Swipe the map sideways. A wait of 4 hours or more is marked in red.</p>
          </div>
        </>
      ) : null}
    </>
  );
}

function RevealedSummary({ revealed }: { revealed: { total: string; note: string; top: { title: string; hours: string }[]; areas: { name: string; hours: string }[] } }) {
  return (
    <section className="panel" aria-label="Rough estimate">
      <p className="eyebrow">Rough estimate</p>
      {revealed.total ? <p className="stat"><span className="v">{revealed.total}</span></p> : null}
      {revealed.top.length ? (
        <ol>
          {revealed.top.map((item) => <li key={item.title}>{item.title}{item.hours ? ` · ${item.hours}` : ""}</li>)}
        </ol>
      ) : null}
      {revealed.areas.length ? (
        <>
          <p className="eyebrow">Solution areas</p>
          <ul>
            {revealed.areas.map((area) => <li key={area.name}>{area.name}{area.hours ? ` · ${area.hours}` : ""}</li>)}
          </ul>
        </>
      ) : null}
      <p className="hint">{ILLUSTRATIVE_NOTE} {revealed.note}</p>
    </section>
  );
}

function Bound({ label, ytext, focusKey, multiline }: { label: string; ytext: Y.Text; focusKey: string; multiline?: boolean }) {
  const id = `c-${focusKey}`;
  return (
    <label className="f" htmlFor={id}>{label}
      <YTextField id={id} ytext={ytext} focusKey={focusKey} multiline={multiline} aria-labelledby="question" />
    </label>
  );
}

function StepFields({ snap, stepId, doc }: { snap: SharedSnap; stepId: string; doc: Y.Doc }) {
  const step = snap.steps.find((item) => item.id === stepId);
  if (!step) return null;
  return (
    <div className="stack" data-focus={`step:${step.id}`}>
      <Bound label="What happens" ytext={step.titleText} focusKey={`step:${step.id}`} />
      <label className="f" htmlFor={`who-${step.id}`}>Who does it
        <select id={`who-${step.id}`} value={step.roleId} onChange={(event) => setStepField(doc, step.id, "roleId", event.target.value)}>
          <option value="">Choose</option>
          {snap.roles.map((role) => <option key={role.id} value={role.id}>{role.name || "Unnamed role"}</option>)}
        </select>
      </label>
      <label className="f" htmlFor={`tool-${step.id}`}>Tool
        <input id={`tool-${step.id}`} value={step.tool} onChange={(event) => setStepField(doc, step.id, "tool", event.target.value)} />
      </label>
      <label className="f" htmlFor={`min-${step.id}`}>Hands-on minutes
        <input id={`min-${step.id}`} inputMode="numeric" value={step.minutes || ""} onChange={(event) => setStepField(doc, step.id, "minutes", Number(event.target.value) || 0)} />
      </label>
      <label className="f" htmlFor={`wait-${step.id}`}>How long it then waits
        <input id={`wait-${step.id}`} inputMode="numeric" value={step.waitValue || ""} onChange={(event) => setStepField(doc, step.id, "waitValue", Number(event.target.value) || 0)} />
      </label>
    </div>
  );
}

function PainComposer({ snap, doc, by }: { snap: SharedSnap; doc: Y.Doc; by: string }) {
  return (
    <div className="stack">
      {snap.pains.map((pain) => (
        <label key={pain.id} className="f" htmlFor={`pain-${pain.id}`}>In your words
          <YTextField id={`pain-${pain.id}`} ytext={pain.textNode} multiline focusKey={`pain:${pain.id}`} />
        </label>
      ))}
      <button className="btn" type="button" onClick={() => addPain(doc, by)}>Add this in your words</button>
    </div>
  );
}
