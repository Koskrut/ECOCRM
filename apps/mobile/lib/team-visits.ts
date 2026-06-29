import type { VisitSummary } from "@/types/crm";

export function isTeamVisitViewer(role?: string | null): boolean {
  return role === "LEAD";
}

export function visitOwnerId(visit: VisitSummary): string | null {
  return visit.owner?.id ?? visit.ownerId ?? null;
}

export function visitOwnerName(visit: VisitSummary): string | null {
  return visit.owner?.fullName?.trim() || null;
}

export type VisitOwnerGroup = {
  ownerId: string;
  ownerName: string;
  visits: VisitSummary[];
};

export function groupVisitsByOwner(visits: VisitSummary[], myUserId: string): VisitOwnerGroup[] {
  const byOwner = new Map<string, VisitSummary[]>();
  const names = new Map<string, string>();

  for (const visit of visits) {
    const ownerId = visitOwnerId(visit) ?? "unknown";
    const ownerName = visitOwnerName(visit) ?? ownerId;
    const bucket = byOwner.get(ownerId);
    if (bucket) bucket.push(visit);
    else byOwner.set(ownerId, [visit]);
    names.set(ownerId, ownerName);
  }

  const groups = [...byOwner.entries()].map(([ownerId, groupVisits]) => ({
    ownerId,
    ownerName: names.get(ownerId) ?? ownerId,
    visits: groupVisits.slice().sort((a, b) => {
      const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    }),
  }));

  groups.sort((a, b) => {
    if (a.ownerId === myUserId) return -1;
    if (b.ownerId === myUserId) return 1;
    return a.ownerName.localeCompare(b.ownerName, "uk");
  });

  return groups;
}
