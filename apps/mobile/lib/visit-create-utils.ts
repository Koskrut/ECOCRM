import type { Contact } from "@/types/crm";

export const DEFAULT_VISIT_DURATION_MIN = 60;

export type VisitScheduleMode = "today" | "backlog";

export const VISIT_PURPOSE_KEYS = [
  "presentation",
  "payment",
  "delivery",
  "followUp",
  "demo",
  "other",
] as const;

export type VisitPurposeKey = (typeof VISIT_PURPOSE_KEYS)[number];

export function contactDisplayName(c: Contact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || "—";
}

export function contactHasCoords(c: Contact): boolean {
  return c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng);
}

/** Round up to next 30-minute slot from now (or given time). */
export function suggestNextSlot(now = new Date()): Date {
  const d = new Date(now);
  d.setSeconds(0, 0);
  const minutes = d.getMinutes();
  const remainder = minutes % 30;
  if (remainder !== 0) d.setMinutes(minutes + (30 - remainder));
  if (d.getTime() <= now.getTime()) d.setMinutes(d.getMinutes() + 30);
  return d;
}

export function buildEndsAt(startsAt: Date, durationMin = DEFAULT_VISIT_DURATION_MIN): Date {
  return new Date(startsAt.getTime() + durationMin * 60_000);
}

export function formatTimeHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function parseTodayTime(hm: string, base = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date(base);
  d.setHours(h, min, 0, 0);
  return d;
}

export function slotAtHour(hour: number, base = new Date()): Date {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}
