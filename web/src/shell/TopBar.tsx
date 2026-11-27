import { Link } from "react-router-dom";
import { useBrand } from "../brand/Brand";
import { Logo } from "../brand/Logo";
import type { Person } from "../lib/room";

export function TopBar({
  status,
  people = [],
  href = "/",
}: {
  status?: "connecting" | "live" | "reconnecting" | "closed";
  people?: Person[];
  href?: string;
}) {
  const { wordmark, productName, assets } = useBrand();
  const label = status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting…" : status === "closed" ? "Disconnected" : status === "connecting" ? "Connecting…" : "";
  return (
    <header className="top">
      <div className="wrap top-inner">
        <Link className="brand" to={href} aria-label={`${wordmark} ${productName}`}>
          <Logo src={assets.logoHorizontal} wordmark={wordmark} />
          <small>{productName}</small>
        </Link>
        {people.length ? (
          <div className="people" aria-label="People in this session">
            {people.map((person) => (
              <span key={person.id} className="avatar" style={{ background: person.color }} title={`${person.name} (${person.role})`}>
                {(person.name || "?").slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        ) : null}
        {label ? (
          <div className={`save${status === "reconnecting" ? " warn" : ""}`} role="status">
            <span className="dot" />
            <span>{label}{status === "reconnecting" ? " Your typing is kept on this device." : ""}</span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
