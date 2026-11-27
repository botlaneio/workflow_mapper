import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { OrgConfig } from "@shared/types";

type ClientBrand = Omit<OrgConfig, "team">;

const fallback: ClientBrand = {
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
  assets: {
    logoHorizontal: "/brand/botlane-horizontal.svg",
    logoIcon: "/brand/botlane-icon.svg",
    favicon: "/brand/favicon.svg",
  },
};

const BrandContext = createContext<ClientBrand>(fallback);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<ClientBrand>(fallback);
  useEffect(() => {
    fetch("/api/public/brand")
      .then((res) => res.json())
      .then((body: { org?: ClientBrand }) => {
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
        const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (icon && body.org.assets?.favicon) icon.href = body.org.assets.favicon;
      })
      .catch(() => {
        /* keep the botLane defaults already in the stylesheet */
      });
  }, []);
  return <BrandContext.Provider value={org}>{children}</BrandContext.Provider>;
}

export function useBrand(): ClientBrand {
  return useContext(BrandContext);
}
