export function Logo({ wordmark = "botLane" }: { wordmark?: string }) {
  return (
    <span className="lockup">
      <svg width="34" height="34" viewBox="-6 -8 132 132" aria-hidden="true" style={{ overflow: "visible", display: "block" }}>
        <defs>
          <radialGradient id="orbS" cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor="#2a3f5e" />
            <stop offset=".5" stopColor="#11253f" />
            <stop offset=".85" stopColor="#081d34" />
            <stop offset="1" stopColor="#061B31" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="58" r="49" fill="none" stroke="var(--logo-ring)" strokeOpacity=".55" strokeWidth="1.8" strokeDasharray="282 26" strokeDashoffset="40" strokeLinecap="round" />
        <circle cx="90.4" cy="19.6" r="4.6" fill="var(--logo-node)" />
        <circle cx="60" cy="58" r="40" fill="url(#orbS)" />
        <path d="M27 40 A40 40 0 0 1 52 19" fill="none" stroke="#ffffff" strokeOpacity=".28" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="45.5" y="49" width="9" height="18" rx="4.5" fill="#ffffff" />
        <rect x="65.5" y="49" width="9" height="18" rx="4.5" fill="var(--logo-eye)" />
      </svg>
      <span>{wordmark}</span>
    </span>
  );
}
