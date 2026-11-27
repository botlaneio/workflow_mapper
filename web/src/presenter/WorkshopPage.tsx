import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CHAPTERS, questionText } from "@shared/chapters";
import {
  addPain,
  addRole,
  addStep,
  deletePain,
  deleteRole,
  deleteStep,
  moveStep,
  readPrivate,
  readShared,
  roleName,
  setChapter,
  setFollowMe,
  setProcessName,
  setRunUnit,
  setRunsPerWeek,
  setStepField,
  toggleFlag,
  toggleKey,
} from "@shared/doc";
import { buildOpportunities } from "@shared/estimate";
import { formatMinutes, positive, waitHours } from "@shared/format";
import { summaryText } from "@shared/summary";
import type { Catalog, WaitUnit } from "@shared/types";
import { api, ApiError, type AuthUser } from "../lib/api";
import { Icon } from "../lib/icons";
import { useRoom } from "../lib/room";
import { YTextField } from "../lib/YText";
import { metricsOf, StatsStrip } from "../map/StatsStrip";
import { Swimlane, useFreshIds } from "../map/Swimlane";
import { OpportunityPanel } from "./OpportunityPanel";
import { PrivatePanel } from "./PrivatePanel";
import { TopBar } from "../shell/TopBar";

interface SessionMeta {
  id: string;
  code: string;
  joinUrl: string;
  processName: string;
  status: string;
  expiresAt: string;
  linkEnabled: boolean;
}

export default function WorkshopPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<{ user: AuthUser }>("/api/auth/me")
      .then((body) => setUser(body.user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) navigate("/app/login");
        else setError(err instanceof Error ? err.message : "Could not load");
      });
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    api<SessionMeta>(`/api/presenter/sessions/${id}`).then(setMeta).catch((err) => setError(err.message));
    api<Catalog>("/api/presenter/catalog").then(setCatalog).catch((err) => setError(err.message));
  }, [user, id]);

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const room = useRoom({
    url: `${protocol}//${location.host}/api/room/${id}/ws`,
    role: "presenter",
    name: user?.name ?? "Presenter",
    enabled: Boolean(user && id),
  });
  const snap = useMemo(() => (room.synced ? readShared(room.shared) : null), [room.shared, room.synced, room.version]);
  const priv = useMemo(() => (room.synced ? readPrivate(room.priv) : null), [room.priv, room.synced, room.version]);
  const fresh = useFreshIds(snap?.steps.map((step) => step.id) ?? []);

  const model = useMemo(() => {
    if (!snap || !catalog) return null;
    return buildOpportunities({
      runsPerWeek: snap.runsPerWeek,
      catalog,
      overrides: priv?.overrides ?? {},
      pains: snap.pains.map((pain) => ({ text: pain.text, area: priv?.painAreas[pain.id] })),
      steps: snap.steps.map((step, index) => ({
        id: step.id,
        title: step.title,
        minutes: step.minutes,
        waitHours: index < snap.steps.length - 1 ? waitHours(step.waitValue, step.waitUnit) : 0,
        flags: step.flags,
        roleName: roleName(snap, step.roleId),
        index,
      })),
    });
  }, [snap, priv, catalog]);

  async function copySummary() {
    if (!snap || !catalog || !model) return;
    const metrics = metricsOf(snap);
    const text = summaryText({
      company: snap.client.company,
      contact: snap.client.contact,
      contactRole: snap.client.contactRole,
      city: snap.client.city,
      product: snap.client.product,
      teamSize: snap.client.teamSize,
      processName: snap.processName,
      runUnit: snap.runUnit,
      runsPerWeek: snap.runsPerWeek,
      handsMinutes: metrics.hands,
      waitMinutes: metrics.waitMin,
      toolCount: metrics.tools,
      people: snap.roles.length,
      steps: model.ranked.length || snap.steps.length ? snap.steps.map((step, index) => ({
        id: step.id,
        title: step.title,
        minutes: step.minutes,
        waitHours: index < snap.steps.length - 1 ? waitHours(step.waitValue, step.waitUnit) : 0,
        flags: step.flags,
        roleName: roleName(snap, step.roleId),
        index,
      })) : [],
      stepLines: snap.steps.map((step, index) => {
        const bits = [
          roleName(snap, step.roleId),
          step.tool,
          positive(step.minutes) ? formatMinutes(step.minutes) : "",
          index < snap.steps.length - 1 && waitHours(step.waitValue, step.waitUnit) ? `then waits ${formatMinutes(waitHours(step.waitValue, step.waitUnit) * 60)}` : "",
        ].filter(Boolean);
        const flags = step.flags.map((flag) => catalog.flags[flag as keyof Catalog["flags"]]?.label).filter(Boolean);
        return `${step.title || "Untitled step"} (${bits.join(", ")})${flags.length ? ` [${flags.join("; ")}]` : ""}${step.clientNote ? ` Note: ${step.clientNote}` : ""}`;
      }),
      pains: snap.pains.map((pain) => ({ text: pain.text, area: priv?.painAreas[pain.id] })),
      whatGood: snap.whatGood,
      overrides: priv?.overrides ?? {},
      catalog,
    });
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Summary copied");
    } catch {
      setNotice(text);
    }
  }

  async function post(path: string, body?: unknown) {
    const next = await api<SessionMeta & { linkEnabled?: boolean; status?: string }>(path, { method: "POST", body: body ? JSON.stringify(body) : "{}" });
    setMeta((current) => current ? { ...current, ...next, linkEnabled: next.linkEnabled ?? current.linkEnabled, status: next.status ?? current.status } : current);
  }

  const editing = room.people.find((person) => person.id !== user?.id && person.focus.startsWith("step:"));
  const editingIndex = editing && snap ? snap.steps.findIndex((step) => step.id === editing.focus.slice(5)) : -1;

  return (
    <>
      <TopBar status={room.status} people={room.people} href="/app" />
      <main id="main" className="wrap" style={{ paddingTop: 8 }} onFocusCapture={(event) => {
        const holder = (event.target as HTMLElement).closest("[data-focus]");
        room.sendFocus(holder?.getAttribute("data-focus") ?? "");
      }}>
        <div className="panel-head">
          <div>
            <p className="eyebrow">Guide the client</p>
            <h1>{snap?.client.company || meta?.processName || "Workshop"}. <em>{snap ? questionText(snap.chapter, snap.prompt, snap.steps[snap.prompt]?.title) : "Connecting…"}</em></h1>
          </div>
          <button className="btn" type="button" onClick={copySummary}><Icon name="clipboard-copy" />Copy summary</button>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {notice && notice !== "Summary copied" ? <textarea readOnly value={notice} aria-label="Summary text" style={{ width: "100%", minHeight: 160 }} /> : null}
        {notice === "Summary copied" ? <p role="status">{notice}</p> : null}
        <div className="rail" role="navigation" aria-label="Chapters">
          {CHAPTERS.map((chapter) => (
            <button key={chapter.id} type="button" aria-current={snap?.chapter === chapter.id ? "step" : undefined} onClick={() => snap && setChapter(room.shared, chapter.id, 0)}>
              {chapter.id}. {chapter.title}
            </button>
          ))}
        </div>
        {meta ? (
          <section className="panel" aria-label="Join link">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="eyebrow">Say this code</div>
                <div className="join-code">{meta.code}</div>
                <p className="hint">Link expires {new Date(meta.expiresAt).toLocaleString()}. The code alone does not open the map.</p>
              </div>
              <div className="stack">
                <a className="sr-only" href={meta.joinUrl}>Open the client link</a>
                <button className="btn" type="button" onClick={() => navigator.clipboard.writeText(meta.joinUrl).then(() => setNotice("Link copied")).catch(() => setNotice(meta.joinUrl))}>Copy join link</button>
                <label className="switch"><input type="checkbox" checked={snap?.followMe ?? true} onChange={(event) => setFollowMe(room.shared, event.target.checked)} /> Follow-me</label>
                <label className="switch"><input type="checkbox" checked={room.showEstimates} onChange={(event) => room.setEstimates(event.target.checked)} /> Show hour estimates to the client</label>
                <div className="row">
                  <button className="btn" type="button" onClick={() => post(`/api/presenter/sessions/${id}/link`, { enabled: !meta.linkEnabled })}>{meta.linkEnabled ? "Turn link off" : "Turn link on"}</button>
                  <button className="btn danger" type="button" onClick={() => post(`/api/presenter/sessions/${id}/end`)}>End session</button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {editing && editingIndex >= 0 ? <p className="banner" role="status">{editing.name} is editing step {editingIndex + 1}</p> : null}
        {!snap || !catalog || !priv ? <p role="status">Connecting…</p> : (
          <>
            <section className="panel" style={{ marginTop: 16 }} aria-labelledby="clientTitle">
              <h2 id="clientTitle">Client. <span>What they told us.</span></h2>
              <div className="grid-2">
                <Field label="Company" ytext={snap.clientText.company} focusKey="field:company" wide />
                <Field label="Contact person" ytext={snap.clientText.contact} focusKey="field:contact" />
                <Field label="Role" ytext={snap.clientText.contactRole} focusKey="field:role" />
                <Field label="City" ytext={snap.clientText.city} focusKey="field:city" />
                <Field label="What they make" ytext={snap.clientText.product} focusKey="field:product" wide />
                <Field label="Team size" ytext={snap.clientText.teamSize} focusKey="field:team" />
                <label className="f">Process
                  <input value={snap.processName} onChange={(event) => setProcessName(room.shared, event.target.value)} />
                </label>
                <label className="f">Runs per week
                  <input inputMode="numeric" value={snap.runsPerWeek || ""} onChange={(event) => setRunsPerWeek(room.shared, Number(event.target.value))} />
                </label>
                <label className="f">One run is one…
                  <input value={snap.runUnit} onChange={(event) => setRunUnit(room.shared, event.target.value)} />
                </label>
              </div>
            </section>
            <StatsStrip snap={snap} recoverable={model && snap.runsPerWeek ? (model.totalHours > 0 ? `~${model.totalHours < 10 ? model.totalHours.toFixed(1).replace(/\.0$/, "") : Math.round(model.totalHours)} h` : "—") : "Add runs"} />
            <section className="panel" style={{ marginTop: 20 }} aria-labelledby="mapTitle">
              <div className="panel-head">
                <h2 id="mapTitle">Current process map. <span>Who does what, and where work waits.</span></h2>
              </div>
              <Swimlane
                steps={snap.steps}
                roles={snap.roles}
                selectedId={selected}
                onSelect={setSelected}
                fresh={fresh}
                areaColor={(step) => {
                  const area = step.flags.length ? (priv.overrides[step.id] || catalog.flagOrder.map((key) => step.flags.includes(key) ? catalog.flags[key].area : "").find(Boolean) || "") : "";
                  return area ? catalog.areas[area as keyof Catalog["areas"]].tone : "";
                }}
                flagStyle={(flag) => {
                  const def = catalog.flags[flag as keyof Catalog["flags"]];
                  return { icon: def?.icon ?? "circle", label: def?.label ?? flag, color: def ? catalog.areas[def.area].tone : undefined };
                }}
                focusNames={Object.fromEntries(room.people.filter((person) => person.focus.startsWith("step:")).map((person) => [person.focus.slice(5), { name: person.name, color: person.color }]))}
              />
            </section>
            <div className="lower">
              <section className="panel">
                <h2>Steps. <span>As the client describes them.</span></h2>
                <div className="eyebrow">People and roles</div>
                <div className="flags">
                  {snap.roles.map((role) => (
                    <span key={role.id} className="row">
                      <YTextField ytext={role.nameText} aria-label="Role name" focusKey={`role:${role.id}`} />
                      <button className="btn ghost" type="button" aria-label={`Remove ${role.name || "role"}`} onClick={() => deleteRole(room.shared, role.id)}><Icon name="x" /></button>
                    </span>
                  ))}
                  <button className="btn" type="button" onClick={() => addRole(room.shared)}><Icon name="user-plus" />Add role</button>
                </div>
                <div className="steps" style={{ marginTop: 12 }}>
                  {snap.steps.map((step, index) => (
                    <article key={step.id} id={`step-${step.id}`} className={`step${selected === step.id ? " sel" : ""}`} data-focus={`step:${step.id}`}>
                      <div className="step-top">
                        <span className="num">{index + 1}</span>
                        <YTextField ytext={step.titleText} aria-label={`Step ${index + 1} title`} focusKey={`step:${step.id}`} placeholder="What happens in this step?" />
                        <button className="btn ghost" type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveStep(room.shared, step.id, -1)}><Icon name="arrow-up" /></button>
                        <button className="btn ghost" type="button" aria-label="Move down" disabled={index === snap.steps.length - 1} onClick={() => moveStep(room.shared, step.id, 1)}><Icon name="arrow-down" /></button>
                        <button className="btn ghost" type="button" aria-label="Delete step" onClick={() => deleteStep(room.shared, step.id)}><Icon name="trash-2" /></button>
                      </div>
                      <div className="grid-2">
                        <label className="f">Who does it
                          <select value={step.roleId} onChange={(event) => setStepField(room.shared, step.id, "roleId", event.target.value)}>
                            <option value="">Choose role</option>
                            {snap.roles.map((role) => <option key={role.id} value={role.id}>{role.name || "Unnamed role"}</option>)}
                          </select>
                        </label>
                        <label className="f">Tool or channel
                          <input value={step.tool} onChange={(event) => setStepField(room.shared, step.id, "tool", event.target.value)} />
                        </label>
                        <label className="f">Hands-on minutes
                          <input inputMode="numeric" value={step.minutes || ""} onChange={(event) => setStepField(room.shared, step.id, "minutes", Number(event.target.value) || 0)} />
                        </label>
                        <label className="f">Wait before next
                          <span className="row">
                            <input inputMode="numeric" aria-label="Wait amount" disabled={index === snap.steps.length - 1} value={step.waitValue || ""} onChange={(event) => setStepField(room.shared, step.id, "waitValue", Number(event.target.value) || 0)} />
                            <select aria-label="Wait unit" disabled={index === snap.steps.length - 1} value={step.waitUnit} onChange={(event) => setStepField(room.shared, step.id, "waitUnit", event.target.value as WaitUnit)}>
                              <option value="m">min</option>
                              <option value="h">hours</option>
                              <option value="d">days</option>
                            </select>
                          </span>
                        </label>
                      </div>
                      <div className="flags">
                        {catalog.flagOrder.map((flag) => {
                          const on = step.flags.includes(flag);
                          const def = catalog.flags[flag];
                          return (
                            <button key={flag} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleFlag(room.shared, step.id, flag)} style={{ color: on ? catalog.areas[def.area].tone : undefined }}>
                              <Icon name={def.icon} size={14} />{def.label}
                            </button>
                          );
                        })}
                      </div>
                      {step.suggestedFlags.length ? <p className="hint">Often seen here: {step.suggestedFlags.map((flag) => catalog.flags[flag as keyof Catalog["flags"]]?.label ?? flag).join(", ")}. Not applied until someone chooses it.</p> : null}
                      <label className="f">What the client said
                        <YTextField ytext={step.clientNoteText} focusKey={`step:${step.id}`} placeholder="In their words" />
                      </label>
                    </article>
                  ))}
                </div>
                <button className="btn" type="button" style={{ marginTop: 12 }} onClick={() => addStep(room.shared, snap.steps.at(-1)?.roleId || snap.roles[0]?.id || "")}><Icon name="plus" />Add step</button>
                <div className="stack" style={{ marginTop: 18 }}>
                  <h2>Pain points. <span>In their words.</span></h2>
                  {snap.pains.map((pain) => (
                    <div key={pain.id} className="row">
                      <YTextField ytext={pain.textNode} multiline aria-label="Pain point" focusKey={`pain:${pain.id}`} />
                      <button className="btn ghost" type="button" aria-label="Remove pain point" onClick={() => deletePain(room.shared, pain.id)}><Icon name="x" /></button>
                    </div>
                  ))}
                  <button className="btn" type="button" onClick={() => addPain(room.shared, user?.name ?? "Presenter")}><Icon name="plus" />Add pain point</button>
                  <label className="f">If this ran itself
                    <YTextField ytext={snap.whatGoodText} multiline focusKey="field:good" />
                  </label>
                  <div>
                    <div className="eyebrow">How work arrives</div>
                    <div className="flags">
                      {["whatsapp", "phone", "email", "indiamart", "distributors", "walkins"].map((channel) => (
                        <button key={channel} type="button" className={`chip${snap.channels.includes(channel) ? " on" : ""}`} aria-pressed={snap.channels.includes(channel)} onClick={() => toggleKey(snap.channelMap, channel)}>
                          {channel}
                        </button>
                      ))}
                    </div>
                    <label className="f" style={{ marginTop: 8 }}>Who answers out of hours
                      <YTextField ytext={snap.afterHoursText} focusKey="field:after" />
                    </label>
                  </div>
                </div>
              </section>
              <div className="side">
                <section className="panel" aria-labelledby="oppTitle">
                  <h2 id="oppTitle">Automation opportunities. <span>By solution area.</span></h2>
                  {model ? <OpportunityPanel model={model} runsPerWeek={snap.runsPerWeek} catalog={catalog} /> : null}
                </section>
                <PrivatePanel snap={snap} priv={priv} doc={room.priv} catalog={catalog} ready={room.synced} />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Field({ label, ytext, focusKey, wide }: { label: string; ytext: import("yjs").Text; focusKey: string; wide?: boolean }) {
  const id = `f-${focusKey}`;
  return (
    <label className={`f${wide ? " wide" : ""}`} htmlFor={id}>{label}
      <YTextField id={id} ytext={ytext} focusKey={focusKey} />
    </label>
  );
}
