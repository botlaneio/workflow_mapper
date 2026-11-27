import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type AuthUser } from "../lib/api";
import { Icon } from "../lib/icons";
import { TopBar } from "../shell/TopBar";

interface TemplateCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  runUnit: string;
  sample: boolean;
  steps: unknown[];
}

interface SessionCard {
  id: string;
  code: string;
  company: string;
  processName: string;
  status: string;
  ownerName: string;
  updatedAt: string;
}

export default function SessionsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [sessions, setSessions] = useState<SessionCard[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState("");

  useEffect(() => {
    api<{ user: AuthUser }>("/api/auth/me").then((body) => setUser(body.user)).catch((err) => {
      if (err instanceof ApiError && err.status === 401) navigate("/app/login");
      else setError(err instanceof Error ? err.message : "Could not load");
    });
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    api<{ templates: TemplateCard[] }>("/api/presenter/templates").then((body) => setTemplates(body.templates)).catch((err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const handle = window.setTimeout(() => {
      api<{ sessions: SessionCard[] }>(`/api/presenter/sessions?q=${encodeURIComponent(query)}`).then((body) => setSessions(body.sessions)).catch((err) => setError(err.message));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [user, query]);

  async function create(templateId: string) {
    setCreating(templateId);
    try {
      const session = await api<{ id: string }>("/api/presenter/sessions", { method: "POST", body: JSON.stringify({ templateId }) });
      navigate(`/app/s/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the session");
      setCreating("");
    }
  }

  return (
    <>
      <TopBar />
      <main id="main" className="wrap" style={{ paddingTop: 28 }}>
        <div className="panel-head">
          <div>
            <p className="eyebrow">Sessions</p>
            <h1>Live workshops. <em>{user ? user.name : ""}</em></h1>
            {user?.role === "admin" ? <p><Link className="btn" to="/app/library">Library admin</Link></p> : null}
          </div>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <label className="f" htmlFor="search" style={{ maxWidth: 360, margin: "12px 0 20px" }}>Search by company
          <input id="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Company name" />
        </label>
        <div className="panel">
          <table className="table">
            <thead>
              <tr><th>Client</th><th>Process</th><th>Status</th><th>Owner</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {sessions.length ? sessions.map((session) => (
                <tr key={session.id}>
                  <td><Link to={`/app/s/${session.id}`}>{session.company || "Untitled client"}</Link><div className="hint">{session.code}</div></td>
                  <td>{session.processName}</td>
                  <td><span className="badge">{session.status}</span></td>
                  <td>{session.ownerName}</td>
                  <td>{new Date(session.updatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              )) : <tr><td colSpan={5}>No sessions yet. Start one from the sample library below.</td></tr>}
            </tbody>
          </table>
        </div>
        <section className="panel" style={{ marginTop: 20 }} aria-labelledby="libraryTitle">
          <div className="panel-head">
            <h2 id="libraryTitle">Start from the library. <span>Manufacturing, labelled sample.</span></h2>
            <span className="badge">Sample</span>
          </div>
          <div className="tpls">
            {templates.map((template) => (
              <button key={template.id} className="tpl" type="button" onClick={() => create(template.id)} disabled={creating === template.id}>
                <span className="ico"><Icon name={template.icon} size={18} /></span>
                <b>{template.name}</b>
                <span className="hint">{template.description}</span>
                <span className="hint">{template.steps.length} steps · one run is one {template.runUnit}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
