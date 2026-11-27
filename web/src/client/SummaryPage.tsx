import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ClientSummary } from "@shared/client-summary";
import { useBrand } from "../brand/Brand";
import { Logo } from "../brand/Logo";

export default function SummaryPage() {
  const { token = "" } = useParams();
  const brand = useBrand();
  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Workflow map · botLane";
    fetch(`/api/summary/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("This summary link is not valid or has expired.");
        return res.json() as Promise<ClientSummary>;
      })
      .then((body) => {
        setSummary(body);
        document.title = `${body.company || "Workflow map"} · ${brand.wordmark}`;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "This summary link is not valid or has expired."));
  }, [token, brand.wordmark]);

  return (
    <>
      <header className="top">
        <div className="wrap top-inner">
          <span className="brand">
            <Logo src={brand.assets.logoHorizontal} wordmark={brand.wordmark} />
            <small>{brand.productName}</small>
          </span>
          <a className="btn" href={`/api/summary/${encodeURIComponent(token)}/pdf`}>Download PDF</a>
        </div>
      </header>
      <main id="main" className="wrap" style={{ paddingTop: 28, maxWidth: 800 }}>
        {error ? <h1>{error}</h1> : null}
        {!summary && !error ? <p role="status">Loading the map…</p> : null}
        {summary ? (
          <>
            <p className="eyebrow">Workflow map</p>
            <h1>{summary.company || "Untitled client"}. <em>{summary.processName}</em></h1>
            <p className="hint">{[summary.contact, summary.contactRole, summary.city, summary.product].filter(Boolean).join(" · ")}</p>
            <p className="hint">{summary.illustrative}</p>
            <section aria-labelledby="stepsTitle">
              <h2 id="stepsTitle">The steps.</h2>
              <ol>
                {summary.steps.map((step) => (
                  <li key={`${step.title}-${step.role}`}>
                    <strong>{step.title}</strong>
                    <span className="hint"> {[step.role, step.tool, step.minutes ? `${step.minutes} min` : "", step.waitLabel ? `then waits ${step.waitLabel}` : ""].filter(Boolean).join(" · ")}
                      {step.flags.length ? ` [${step.flags.join("; ")}]` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="wordsTitle">
              <h2 id="wordsTitle">In their words.</h2>
              {summary.pains.length ? summary.pains.map((pain) => <blockquote className="quote" key={pain}>“{pain}”</blockquote>) : <p className="hint">No pain points were written down.</p>}
              {summary.whatGood ? <p>If this ran itself: {summary.whatGood}</p> : null}
            </section>
            <section aria-labelledby="noticedTitle">
              <h2 id="noticedTitle">What we noticed.</h2>
              {summary.totalHours ? <p><strong>{summary.totalHours}</strong></p> : null}
              {summary.noticed.length ? summary.noticed.map((group) => (
                <div key={group.area}>
                  <h3>{group.area}{group.hours ? ` · ${group.hours}` : ""}</h3>
                  <ul>{group.steps.map((step) => <li key={step.title}>{step.title}{step.hours ? ` · ${step.hours}` : ""}</li>)}</ul>
                </div>
              )) : <p className="hint">No steps were flagged.</p>}
              <p className="hint">{summary.note}</p>
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
