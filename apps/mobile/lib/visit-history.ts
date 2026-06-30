import { formatLocalDateKey, formatHumanDate, parseDateKey } from "@/lib/date";
import { groupVisitsByOwner, visitOwnerId, visitOwnerName } from "@/lib/team-visits";
import type { VisitSummary } from "@/types/crm";

export type VisitHistorySection = {
  key: string;
  dateKey: string;
  ownerId?: string;
  title: string;
  data: VisitSummary[];
};

/** Local calendar day for a completed visit. */
export function visitDayKey(visit: VisitSummary): string {
  const iso = visit.completedAt ?? visit.startsAt ?? visit.endsAt;
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return formatLocalDateKey(d);
}

function sortVisitsByTime(visits: VisitSummary[]): VisitSummary[] {
  return visits.slice().sort((a, b) => {
    const ta = a.completedAt ?? a.startsAt ?? a.endsAt;
    const tb = b.completedAt ?? b.startsAt ?? b.endsAt;
    const ma = ta ? new Date(ta).getTime() : 0;
    const mb = tb ? new Date(tb).getTime() : 0;
    return mb - ma;
  });
}

/** Group visits by local day, newest days first. */
export function groupVisitsByDay(visits: VisitSummary[]): VisitHistorySection[] {
  const byDay = new Map<string, VisitSummary[]>();
  for (const visit of visits) {
    const key = visitDayKey(visit);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(visit);
    else byDay.set(key, [visit]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayVisits]) => ({
      key: dateKey,
      dateKey,
      title: formatHumanDate(parseDateKey(dateKey)),
      data: sortVisitsByTime(dayVisits),
    }));
}

/** For team leads: flat sections per day + owner (newest days first). */
export function groupVisitsByDayAndOwner(
  visits: VisitSummary[],
  myUserId: string,
): VisitHistorySection[] {
  const byDay = new Map<string, VisitSummary[]>();
  for (const visit of visits) {
    const key = visitDayKey(visit);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(visit);
    else byDay.set(key, [visit]);
  }

  const sections: Array<Omit<VisitHistorySection, "data"> & { data: VisitSummary[] }> = [];
  const sortedDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  for (const dateKey of sortedDays) {
    const dayVisits = byDay.get(dateKey) ?? [];
    const ownerGroups = groupVisitsByOwner(dayVisits, myUserId);
    const dayLabel = formatHumanDate(parseDateKey(dateKey));

    for (const group of ownerGroups) {
      const isMe = group.ownerId === myUserId;
      sections.push({
        key: `${dateKey}:${group.ownerId}`,
        dateKey,
        ownerId: group.ownerId !== "unknown" ? group.ownerId : undefined,
        title: isMe ? dayLabel : `${dayLabel} · ${group.ownerName}`,
        data: sortVisitsByTime(group.visits),
      });
    }
  }

  return sections;
}

export function visitOwnerLabel(visit: VisitSummary, myUserId: string): string | null {
  const ownerId = visitOwnerId(visit);
  if (!ownerId || ownerId === myUserId) return null;
  return visitOwnerName(visit);
}
