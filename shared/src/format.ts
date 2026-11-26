import type { WaitUnit } from "./types";

export function positive(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function waitHours(value: unknown, unit: WaitUnit): number {
  const w = positive(value);
  if (unit === "d") return w * 24;
  if (unit === "m") return w / 60;
  return w;
}

export function formatMinutes(minutes: number): string {
  const m = positive(minutes) === minutes ? minutes : 0;
  if (!m) return "0 min";
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 60 * 24) {
    const h = m / 60;
    const shown = h < 10 ? h.toFixed(1).replace(/\.0$/, "") : String(Math.round(h));
    return `${shown} h`;
  }
  const d = m / 1440;
  const shown = d < 10 ? d.toFixed(1).replace(/\.0$/, "") : String(Math.round(d));
  return `${shown}${d >= 1.05 ? " days" : " day"}`;
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0";
  if (hours < 10) return hours.toFixed(1).replace(/\.0$/, "");
  return String(Math.round(hours));
}

export function formatHourEstimate(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  return `~${formatHours(hours)} h/week`;
}
