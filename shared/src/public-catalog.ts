import type { FlagKey, PublicFlag } from "./types";

/** Labels and icons only. Factors, fixes and solution areas are not in this file. */
export const PUBLIC_FLAGS: PublicFlag[] = [
  { key: "missed", label: "Enquiries missed or slow", icon: "phone-missed" },
  { key: "repeat", label: "Same questions daily", icon: "messages-square" },
  { key: "followup", label: "Follow-ups slip", icon: "bell-off" },
  { key: "manual", label: "Typed in by hand", icon: "keyboard" },
  { key: "rekey", label: "Re-keyed between tools", icon: "copy" },
  { key: "approval", label: "Waits on approval", icon: "stamp" },
  { key: "errors", label: "Errors or rework", icon: "rotate-ccw" },
  { key: "status", label: "Customers chase status", icon: "message-circle-question" },
  { key: "payment", label: "Invoices or payments chased", icon: "receipt" },
  { key: "report", label: "Reports built by hand", icon: "sheet" },
];

export const PUBLIC_FLAG_ORDER: FlagKey[] = PUBLIC_FLAGS.map((flag) => flag.key);
