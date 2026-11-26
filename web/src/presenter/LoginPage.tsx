import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { TopBar } from "../shell/TopBar";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@botlane.io");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/dev-login", { method: "POST", body: JSON.stringify({ email, password }) });
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main id="main" className="wrap" style={{ maxWidth: 520, paddingTop: 48 }}>
        <p className="eyebrow">Team</p>
        <h1>Sign in. <em>Then open a live map.</em></h1>
        <form className="panel stack" style={{ marginTop: 24 }} onSubmit={submit}>
          <label className="f" htmlFor="email">Work email
            <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="f" htmlFor="password">Password
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
          <p className="hint">Local preview accepts a team email that is already on the account. Deployed previews use Cloudflare Access instead of this password.</p>
        </form>
      </main>
    </>
  );
}
