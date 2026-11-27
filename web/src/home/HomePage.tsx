import { Link } from "react-router-dom";
import { TopBar } from "../shell/TopBar";

export function HomePage() {
  return (
    <>
      <TopBar />
      <section className="intro" aria-labelledby="pageTitle">
        <img className="streak" src="/hero-streak.svg" alt="" />
        <div className="wrap">
          <p className="eyebrow">Discovery workshops</p>
          <h1 id="pageTitle">Map how the work runs today. <em>Then find what to automate.</em></h1>
          <p>During a call, share a link. Your client opens it with no account, and you draw their current process together, live.</p>
          <p><Link className="btn primary" to="/app/login">Team sign-in</Link></p>
          <p className="hint">For the botLane team. Clients join from the link you send them. They do not need an account.</p>
        </div>
      </section>
    </>
  );
}
