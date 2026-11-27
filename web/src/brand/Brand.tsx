import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { OrgConfig } from "@shared/types";

const fallback: OrgConfig = {
  id: "botlane",
  name: "botLane",
  productName: "Workflow Mapper",
  domain: "map.botlane.io",
  wordmark: "botLane",
  colors: {
    ink: "#061B31",
    muted: "#425E73",
    line: "#E3E8ED",
    soft: "#F6F8FA",
    accent: "#5333F5",
    buttonHover: "#1C3250",
    page: "#FFFFFF",
  },
  logo: { ring: "#b5adff", node: "#ff8a1f", eye: "#b5adff" },
};

const BrandContext = createContext<OrgConfig>(fallback);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<OrgConfig>(fallback);
  useEffect(() => {
    fetch("/api/public/brand")
      .then((res) => res.json())
      .then((body: { org?: OrgConfig }) => {
        if (!body.org) return;
        setOrg(body.org);
        const root = document.documentElement;
        const colors = body.org.colors;
        root.style.setProperty("--ink", colors.ink);
        root.style.setProperty("--muted", colors.muted);
        root.style.setProperty("--line", colors.line);
        root.style.setProperty("--soft", colors.soft);
        root.style.setProperty("--accent", colors.accent);
        root.style.setProperty("--btn-hover", colors.buttonHover);
        root.style.setProperty("--bg", colors.page);
        root.style.setProperty("--logo-ring", body.org.logo.ring);
        root.style.setProperty("--logo-node", body.org.logo.node);
        root.style.setProperty("--logo-eye", body.org.logo.eye);
      })
      .catch(() => {
        /* keep the botLane defaults already in the stylesheet */
      });
  }, []);
  return <BrandContext.Provider value={org}>{children}</BrandContext.Provider>;
}

export function useBrand(): OrgConfig {
  return useContext(BrandContext);
}
