import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { VisitHistoryItem } from "@/lib/api/resources/visits";
import { visitOutcomeLabel } from "@/lib/status-labels";

export type ViewMode = "list" | "calendar";
export type OutcomeFilter = "all" | "success" | "follow_up" | "problem";

export type OutcomeMeta = { label: string; badgeClass: string };

const OUTCOME_BADGE: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-800",
  FOLLOW_UP: "bg-amber-100 text-amber-800",
  NO_DECISION: "bg-zinc-100 text-zinc-700",
  NOT_RELEVANT: "bg-zinc-100 text-zinc-600",
  FAILED: "bg-red-100 text-red-800",
};

export function outcomeMeta(outcome: string | null | undefined): OutcomeMeta {
  if (!outcome) return { label: visitOutcomeLabel(null), badgeClass: "bg-zinc-100 text-zinc-600" };
  return {
    label: visitOutcomeLabel(outcome),
    badgeClass: OUTCOME_BADGE[outcome] ?? "bg-zinc-100 text-zinc-700",
  };
}

export function visitDisplayTitle(v: VisitHistoryItem): string {
  if (v.title?.trim()) return v.title.trim();
  if (v.company?.name) return v.company.name;
  if (v.contact) {
    const name = [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ");
    if (name) return name;
  }
  if (v.addressText?.trim()) return v.addressText.trim();
  return "Візит";
}

export function visitSubtitle(v: VisitHistoryItem): string | null {
  const parts: string[] = [];
  if (v.company?.name && v.contact) {
    parts.push(
      [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ") || v.contact.phone,
    );
  } else if (v.company?.name && v.title?.trim()) {
    parts.push(v.company.name);
  }
  if (v.addressText?.trim() && visitDisplayTitle(v) !== v.addressText.trim()) {
    parts.push(v.addressText.trim());
  }
  return parts.length ? parts.join(" · ") : null;
}

export function matchesOutcomeFilter(v: VisitHistoryItem, filter: OutcomeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "success") return v.outcome === "SUCCESS";
  if (filter === "follow_up") return v.outcome === "FOLLOW_UP";
  return v.outcome === "FAILED" || v.outcome === "NO_DECISION" || v.outcome === "NOT_RELEVANT";
}

export function computeSummary(items: VisitHistoryItem[]) {
  let success = 0;
  let followUp = 0;
  let problem = 0;
  let nextAction = 0;
  for (const v of items) {
    if (v.outcome === "SUCCESS") success += 1;
    if (v.outcome === "FOLLOW_UP") followUp += 1;
    if (v.outcome === "FAILED" || v.outcome === "NO_DECISION" || v.outcome === "NOT_RELEVANT") {
      problem += 1;
    }
    if (v.nextActionAt || v.nextActionNote?.trim()) nextAction += 1;
  }
  return { total: items.length, success, followUp, problem, nextAction };
}

export type DayBucket = {
  dateKey: string;
  total: number;
  success: number;
  followUp: number;
  problem: number;
};

export function groupVisitsByDay(items: VisitHistoryItem[]): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  for (const v of items) {
    if (!v.completedAt) continue;
    const dateKey = format(new Date(v.completedAt), "yyyy-MM-dd");
    const bucket = map.get(dateKey) ?? {
      dateKey,
      total: 0,
      success: 0,
      followUp: 0,
      problem: 0,
    };
    bucket.total += 1;
    if (v.outcome === "SUCCESS") bucket.success += 1;
    else if (v.outcome === "FOLLOW_UP") bucket.followUp += 1;
    else if (
      v.outcome === "FAILED" ||
      v.outcome === "NO_DECISION" ||
      v.outcome === "NOT_RELEVANT"
    ) {
      bucket.problem += 1;
    }
    map.set(dateKey, bucket);
  }
  return map;
}

export function calendarCells(monthAnchor: string): Date[] {
  const anchor = parseISO(`${monthAnchor}T12:00:00`);
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function quickRange(kind: "today" | "7d" | "30d" | "month"): { from: string; to: string } {
  const now = new Date();
  const to = format(now, "yyyy-MM-dd");
  if (kind === "today") return { from: to, to };
  if (kind === "7d") return { from: format(addDays(now, -6), "yyyy-MM-dd"), to };
  if (kind === "30d") return { from: format(addDays(now, -29), "yyyy-MM-dd"), to };
  return { from: format(startOfMonth(now), "yyyy-MM-dd"), to };
}

export function dayAccent(bucket: DayBucket | undefined): string {
  if (!bucket || bucket.total === 0) return "border-zinc-100 bg-white";
  if (bucket.problem > 0 && bucket.problem >= bucket.success) {
    return "border-red-200 bg-red-50/80";
  }
  if (bucket.followUp > 0) return "border-amber-200 bg-amber-50/80";
  if (bucket.success > 0) return "border-emerald-200 bg-emerald-50/80";
  return "border-zinc-200 bg-zinc-50";
}

export function isInDisplayMonth(day: Date, monthAnchor: string): boolean {
  return isSameMonth(day, parseISO(`${monthAnchor}T12:00:00`));
}

export function visitDayKey(v: VisitHistoryItem): string {
  const iso = v.completedAt ?? v.startsAt ?? v.endsAt;
  if (!iso) return "unknown";
  return format(new Date(iso), "yyyy-MM-dd");
}

function sortVisitsByCompletedDesc(visits: VisitHistoryItem[]): VisitHistoryItem[] {
  return visits.slice().sort((a, b) => {
    const ma = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const mb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return mb - ma;
  });
}

export function formatDaySectionTitle(dateKey: string): string {
  return format(parseISO(`${dateKey}T12:00:00`), "EEEE, d MMMM yyyy");
}

export type VisitHistoryListSection = {
  key: string;
  dateKey: string;
  ownerId?: string;
  title: string;
  visits: VisitHistoryItem[];
};

function visitOwnerId(v: VisitHistoryItem): string | null {
  return v.owner?.id ?? v.ownerId ?? null;
}

function visitOwnerName(v: VisitHistoryItem): string | null {
  return v.owner?.fullName?.trim() || v.owner?.email?.trim() || null;
}

/** List sections grouped by day, newest first. */
export function groupVisitsIntoDaySections(visits: VisitHistoryItem[]): VisitHistoryListSection[] {
  const byDay = new Map<string, VisitHistoryItem[]>();
  for (const v of visits) {
    const key = visitDayKey(v);
    if (key === "unknown") continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(v);
    else byDay.set(key, [v]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayVisits]) => ({
      key: dateKey,
      dateKey,
      title: formatDaySectionTitle(dateKey),
      visits: sortVisitsByCompletedDesc(dayVisits),
    }));
}

/** For team view without owner filter: sections per day + manager. */
export function groupVisitsIntoDayOwnerSections(
  visits: VisitHistoryItem[],
  myUserId: string,
): VisitHistoryListSection[] {
  const byDay = new Map<string, VisitHistoryItem[]>();
  for (const v of visits) {
    const key = visitDayKey(v);
    if (key === "unknown") continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(v);
    else byDay.set(key, [v]);
  }

  const sections: VisitHistoryListSection[] = [];
  const sortedDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  for (const dateKey of sortedDays) {
    const dayVisits = byDay.get(dateKey) ?? [];
    const byOwner = new Map<string, VisitHistoryItem[]>();
    const names = new Map<string, string>();

    for (const v of dayVisits) {
      const oid = visitOwnerId(v) ?? "unknown";
      const bucket = byOwner.get(oid);
      if (bucket) bucket.push(v);
      else byOwner.set(oid, [v]);
      names.set(oid, visitOwnerName(v) ?? oid);
    }

    const ownerIds = [...byOwner.keys()].sort((a, b) => {
      if (a === myUserId) return -1;
      if (b === myUserId) return 1;
      return (names.get(a) ?? a).localeCompare(names.get(b) ?? b, "uk");
    });

    const dayLabel = formatDaySectionTitle(dateKey);
    for (const oid of ownerIds) {
      const isMe = oid === myUserId;
      sections.push({
        key: `${dateKey}:${oid}`,
        dateKey,
        ownerId: oid !== "unknown" ? oid : undefined,
        title: isMe ? dayLabel : `${dayLabel} · ${names.get(oid) ?? oid}`,
        visits: sortVisitsByCompletedDesc(byOwner.get(oid) ?? []),
      });
    }
  }

  return sections;
}
