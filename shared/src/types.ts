export type Industry = "manufacturing" | "real-estate" | "clinics";

export type AreaKey = "acq" | "front" | "ops" | "fin" | "cx" | "bi";

export type FlagKey =
  | "missed"
  | "repeat"
  | "followup"
  | "manual"
  | "rekey"
  | "approval"
  | "errors"
  | "status"
  | "payment"
  | "report";

export type WaitUnit = "m" | "h" | "d";

export type SessionStatus = "live" | "completed" | "archived";

export type UserRole = "admin" | "presenter";

export interface AreaDef {
  key: AreaKey;
  name: string;
  icon: string;
  tint: string;
  tone: string;
}

export interface FlagDef {
  key: FlagKey;
  label: string;
  icon: string;
  area: AreaKey;
  factor: number;
  fix: string;
}

export interface Catalog {
  areaOrder: AreaKey[];
  areas: Record<AreaKey, AreaDef>;
  flagOrder: FlagKey[];
  flags: Record<FlagKey, FlagDef>;
}

export interface PublicFlag {
  key: FlagKey;
  label: string;
  icon: string;
}

export interface OrgColors {
  ink: string;
  muted: string;
  line: string;
  soft: string;
  accent: string;
  buttonHover: string;
  page: string;
}

export interface OrgAssets {
  logoHorizontal: string;
  logoIcon: string;
  favicon: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "admin" | "presenter";
}

export interface OrgConfig {
  id: string;
  name: string;
  productName: string;
  domain: string;
  wordmark: string;
  colors: OrgColors;
  assets: OrgAssets;
  /** Presenter sign-in allowlist. Not sent on the public brand response. */
  team: TeamMember[];
  /** Comp AI REST base, including /rest. Server reads this; the key stays a Worker secret. */
  crmBaseUrl?: string;
}

export interface PublicBrand {
  org: OrgConfig;
  flags: PublicFlag[];
  areas: AreaDef[];
}

export interface TemplateStep {
  title: string;
  role: string;
  tool: string;
  commonFlags: FlagKey[];
}

export interface ProcessTemplate {
  id: string;
  orgId: string;
  industry: Industry;
  name: string;
  description: string;
  runUnit: string;
  roles: string[];
  steps: TemplateStep[];
  questions: string[];
  areas: AreaKey[];
  status: "active" | "archived";
  version: number;
  sample: boolean;
  icon: string;
}

export interface RevealedEstimates {
  total: string;
  note: string;
  top: { title: string; hours: string }[];
  areas: { name: string; hours: string }[];
}

export const ESTIMATE_NOTE = "Rough estimate for discussion, not a result.";

export const ILLUSTRATIVE_NOTE = "Illustrative, based on what you told us today.";
