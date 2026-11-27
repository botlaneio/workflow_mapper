import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PUBLIC_FLAGS } from "@shared/public-catalog";
import { api, ApiError, type AuthUser } from "../lib/api";
import { TopBar } from "../shell/TopBar";

interface StepDraft { title: string; role: string; tool: string; commonFlags: string[] }
interface TemplateRow {
  id: string;
  name: string;
  description: string;
  run_unit: string;
  status: string;
  version: number;
  data_json: string;
}
interface ProposalRow {
  id: string;
  kind: string;
  name: string;
  description: string;
  status: string;
  data_json: string;
}

const emptyStep = (): StepDraft => ({ title: "", role: "", tool: "", commonFlags: [] });

export default function LibraryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [runUnit, setRunUnit] = useState("order");
  const [roles, setRoles] = useState("Owner");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [questions, setQuestions] = useState("");

  function load() {
    api<{ templates: TemplateRow[]; proposals: ProposalRow[] }>("/api/presenter/library")
      .then((body) => { setTemplates(body.templates); setProposals(body.proposals); })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    api<{ user: AuthUser }>("/api/auth/me").then((body) => {
      if (body.user.role !== "admin") navigate("/app");
      else { setUser(body.user); load(); }
    }).catch((err) => {
      if (err instanceof ApiError && err.status === 401) navigate("/app/login");
      else setError(err.message);
    });
  }, [navigate]);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/presenter/library", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          runUnit,
          roles: roles.split(",").map((role) => role.trim()).filter(Boolean),
          steps: steps.filter((step) => step.title.trim()),
          questions: questions.split("\n").map((line) => line.trim()).filter(Boolean),
          areas: [],
        }),
      });
      setNotice("Template added to the library.");
      setName("");
      setDescription("");
      setSteps([emptyStep()]);
      setQuestions("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    await api(`/api/presenter/library/proposals/${id}`, { method: "POST", body: JSON.stringify({ decision }) });
    setNotice(decision === "approve" ? "Approved and added to the library." : "Suggestion rejected.");
    load();
  }

  return (
    <>
      <TopBar href="/app" />
      <main id="main" className="wrap" style={{ paddingTop: 28 }}>
        <p className="eyebrow">Admin · {user?.name}</p>
        <h1>Process library. <em>Nothing goes live until you approve it.</em></h1>
        <p><Link to="/app">Back to sessions</Link></p>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        <section className="panel" style={{ marginTop: 16 }} aria-labelledby="pendingTitle">
          <h2 id="pendingTitle">Waiting for approval.</h2>
          {proposals.filter((item) => item.status === "pending").length ? proposals.filter((item) => item.status === "pending").map((item) => {
            const data = JSON.parse(item.data_json) as { steps?: StepDraft[] };
            return (
              <article key={item.id} className="stack" style={{ marginTop: 12 }}>
                <h3>{item.name} <span className="badge">{item.kind}</span></h3>
                <p className="hint">{item.description}</p>
                <ul>{(data.steps ?? []).map((step) => <li key={step.title}>{step.title} · {step.role} · {step.tool}</li>)}</ul>
                <div className="row">
                  <button className="btn primary" type="button" onClick={() => decide(item.id, "approve")}>Approve</button>
                  <button className="btn" type="button" onClick={() => decide(item.id, "reject")}>Reject</button>
                </div>
              </article>
            );
          }) : <p className="hint">No suggestions waiting.</p>}
        </section>
        <section className="panel" style={{ marginTop: 16 }} aria-labelledby="addTitle">
          <h2 id="addTitle">Add a template.</h2>
          <form className="stack" onSubmit={createTemplate}>
            <label className="f" htmlFor="tpl-name">Name<input id="tpl-name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label className="f" htmlFor="tpl-desc">Description<textarea id="tpl-desc" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label className="f" htmlFor="tpl-unit">One run is one…<input id="tpl-unit" value={runUnit} onChange={(event) => setRunUnit(event.target.value)} /></label>
            <label className="f" htmlFor="tpl-roles">Roles, separated by commas<input id="tpl-roles" value={roles} onChange={(event) => setRoles(event.target.value)} /></label>
            <div className="eyebrow">Steps</div>
            {steps.map((step, index) => (
              <div className="grid-2" key={index}>
                <label className="f">Title<input aria-label={`Step ${index + 1} title`} value={step.title} onChange={(event) => setSteps(steps.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label>
                <label className="f">Role<input aria-label={`Step ${index + 1} role`} value={step.role} onChange={(event) => setSteps(steps.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} /></label>
                <label className="f">Tool<input aria-label={`Step ${index + 1} tool`} value={step.tool} onChange={(event) => setSteps(steps.map((item, i) => i === index ? { ...item, tool: event.target.value } : item))} /></label>
                <label className="f">Common flags
                  <select aria-label={`Step ${index + 1} flags`} multiple value={step.commonFlags} onChange={(event) => {
                    const chosen = [...event.target.selectedOptions].map((option) => option.value);
                    setSteps(steps.map((item, i) => i === index ? { ...item, commonFlags: chosen } : item));
                  }}>
                    {PUBLIC_FLAGS.map((flag) => <option key={flag.key} value={flag.key}>{flag.label}</option>)}
                  </select>
                </label>
              </div>
            ))}
            <button className="btn" type="button" onClick={() => setSteps([...steps, emptyStep()])}>Add step</button>
            <label className="f" htmlFor="tpl-questions">Discovery questions, one per line<textarea id="tpl-questions" value={questions} onChange={(event) => setQuestions(event.target.value)} /></label>
            <button className="btn primary" type="submit">Add to library</button>
          </form>
        </section>
        <section className="panel" style={{ marginTop: 16 }} aria-labelledby="liveTitle">
          <h2 id="liveTitle">In the library.</h2>
          <table className="table">
            <thead><tr><th>Name</th><th>Status</th><th>Version</th><th></th></tr></thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>{template.name}<div className="hint">{template.description}</div></td>
                  <td><span className="badge">{template.status}</span></td>
                  <td>{template.version}</td>
                  <td>{template.status === "active" ? <button className="btn" type="button" onClick={() => api(`/api/presenter/library/${template.id}/archive`, { method: "POST", body: "{}" }).then(load)}>Archive</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
