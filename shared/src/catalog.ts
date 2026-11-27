import type { AreaKey, Catalog, FlagKey } from "./types";

const areas: Catalog["areas"] = {
  acq: { key: "acq", name: "Customer Acquisition", icon: "target", tint: "#FFF1E3", tone: "#D4640A" },
  front: { key: "front", name: "AI Front Office", icon: "headset", tint: "#FFECEA", tone: "#D9402F" },
  ops: { key: "ops", name: "Business Operations", icon: "workflow", tint: "#FDEEFB", tone: "#B8379F" },
  fin: { key: "fin", name: "Financial Administration", icon: "receipt", tint: "#EFEBFF", tone: "#5333F5" },
  cx: { key: "cx", name: "Customer Experience", icon: "heart-handshake", tint: "#E8F0FF", tone: "#3466D6" },
  bi: { key: "bi", name: "Business Intelligence", icon: "chart-line", tint: "#EEF1F5", tone: "#061B31" },
};

const flags: Catalog["flags"] = {
  missed: {
    key: "missed",
    label: "Enquiries missed or slow",
    icon: "phone-missed",
    area: "front",
    factor: 0.7,
    fix: "Answer and qualify enquiries instantly, including after hours, then pass warm ones to the team.",
  },
  repeat: {
    key: "repeat",
    label: "Same questions daily",
    icon: "messages-square",
    area: "front",
    factor: 0.6,
    fix: "Answer routine questions (price lists, specs, lead times) automatically from approved answers.",
  },
  followup: {
    key: "followup",
    label: "Follow-ups slip",
    icon: "bell-off",
    area: "acq",
    factor: 0.6,
    fix: "Schedule follow-ups automatically and remind the owner until the buyer replies or the lead is closed.",
  },
  manual: {
    key: "manual",
    label: "Typed in by hand",
    icon: "keyboard",
    area: "ops",
    factor: 0.8,
    fix: "Capture details once at the source and fill the next document or system automatically.",
  },
  rekey: {
    key: "rekey",
    label: "Re-keyed between tools",
    icon: "copy",
    area: "ops",
    factor: 0.9,
    fix: "Connect the tools so the record moves across without retyping.",
  },
  approval: {
    key: "approval",
    label: "Waits on approval",
    icon: "stamp",
    area: "ops",
    factor: 0.4,
    fix: "Send approvals to the right person on WhatsApp with one-tap approve, and escalate when they stall.",
  },
  errors: {
    key: "errors",
    label: "Errors or rework",
    icon: "rotate-ccw",
    area: "ops",
    factor: 0.5,
    fix: "Add checks that catch mistakes before the work moves to the next person.",
  },
  status: {
    key: "status",
    label: "Customers chase status",
    icon: "message-circle-question",
    area: "cx",
    factor: 0.7,
    fix: "Send customers updates automatically at each milestone.",
  },
  payment: {
    key: "payment",
    label: "Invoices or payments chased",
    icon: "receipt",
    area: "fin",
    factor: 0.7,
    fix: "Raise invoices from the order and send payment reminders on a schedule.",
  },
  report: {
    key: "report",
    label: "Reports built by hand",
    icon: "sheet",
    area: "bi",
    factor: 0.8,
    fix: "Replace the manual report with a live dashboard built from the systems already in use.",
  },
};

export const BOTLANE_CATALOG: Catalog = {
  areaOrder: ["acq", "front", "ops", "fin", "cx", "bi"],
  areas,
  flagOrder: [
    "missed",
    "repeat",
    "followup",
    "manual",
    "rekey",
    "approval",
    "errors",
    "status",
    "payment",
    "report",
  ],
  flags,
};

export const BOTLANE_ORG = {
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

export function isAreaKey(value: string): value is AreaKey {
  return BOTLANE_CATALOG.areaOrder.includes(value as AreaKey);
}

export function isFlagKey(value: string): value is FlagKey {
  return BOTLANE_CATALOG.flagOrder.includes(value as FlagKey);
}
