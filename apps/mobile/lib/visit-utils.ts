import type { VisitSummary } from "@/types/crm";
import { t } from "@/lib/i18n";

const DONE_STATUSES = new Set(["DONE", "COMPLETED", "CANCELED", "CANCELLED"]);

export function visitLabel(v: VisitSummary): string {
  if (v.title?.trim()) return v.title.trim();
  if (v.contact) {
    return [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ");
  }
  if (v.company?.name) return v.company.name;
  return t("visit.defaultTitle");
}

export function visitTimeRange(v: VisitSummary): string {
  if (!v.startsAt) return "";
  const start = new Date(v.startsAt);
  const h = start.getHours();
  const m = String(start.getMinutes()).padStart(2, "0");
  if (v.endsAt) {
    const end = new Date(v.endsAt);
    const eh = end.getHours();
    const em = String(end.getMinutes()).padStart(2, "0");
    return `${h}:${m}–${eh}:${em}`;
  }
  return `${h}:${m}`;
}

export function visitPhone(v: VisitSummary): string | null {
  const c = v.contact?.phone?.trim();
  if (c) return c;
  const co = v.company?.phone?.trim();
  return co || null;
}

export function isVisitDone(v: VisitSummary): boolean {
  return DONE_STATUSES.has(v.status);
}

export function findNearestVisit(items: VisitSummary[]): VisitSummary | null {
  const pending = items
    .filter((v) => !isVisitDone(v))
    .slice()
    .sort((a, b) => {
      const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
  return pending[0] ?? null;
}

export function visitProgress(items: VisitSummary[]): { done: number; total: number } {
  const total = items.length;
  const done = items.filter((v) => isVisitDone(v)).length;
  return { done, total };
}

export type VisitCountdownKind = "none" | "now" | "future" | "late";

export function visitCountdown(
  v: VisitSummary,
  now = new Date(),
): { kind: VisitCountdownKind; minutes: number } {
  if (!v.startsAt) return { kind: "none", minutes: 0 };
  const minutes = Math.round((new Date(v.startsAt).getTime() - now.getTime()) / 60_000);
  if (minutes > 0 && minutes <= 60) return { kind: "future", minutes };
  if (minutes <= 0 && minutes > -30) return { kind: "now", minutes };
  if (minutes <= -30) return { kind: "late", minutes: Math.abs(minutes) };
  return { kind: "none", minutes: 0 };
}

export function visitCountdownLabel(v: VisitSummary, now = new Date()): string | null {
  const { kind, minutes } = visitCountdown(v, now);
  if (kind === "future") return t("today.countdownIn", { minutes });
  if (kind === "now") return t("today.countdownNow");
  if (kind === "late") return t("today.countdownLate", { minutes });
  return null;
}
