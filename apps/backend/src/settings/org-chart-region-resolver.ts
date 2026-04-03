import { UKRAINE_REGIONS } from "../store/checkout/uk-regions";

export type OrgChartStructure = {
  assignments: Record<string, string | null>;
  extraSlots: string[];
  regions: Record<string, string[]>;
};

export type RegionAssignment = {
  region: string;
  slotId: string;
  managerId: string;
  leadSlotId: string | null;
  leadId: string | null;
};

const CANONICAL_REGION_SET = new Set(UKRAINE_REGIONS);

export function normalizeRegionName(region: string): string {
  return String(region ?? "").trim().toLocaleLowerCase("uk");
}

export function canonicalizeRegionName(region: string): string | null {
  const normalized = normalizeRegionName(region);
  if (!normalized) return null;
  for (const candidate of UKRAINE_REGIONS) {
    if (normalizeRegionName(candidate) === normalized) return candidate;
  }
  return null;
}

export function isKnownRegion(region: string): boolean {
  return CANONICAL_REGION_SET.has(region);
}

/** Слот руководителя ветки: lead1 / lead2 (для m1-* / m2-*). */
export function resolveLeadSlotId(slotId: string): string | null {
  if (slotId === "lead1" || slotId.startsWith("m1-")) return "lead1";
  if (slotId === "lead2" || slotId.startsWith("m2-")) return "lead2";
  return null;
}

export function isOrgChartLeadSlot(slotId: string): boolean {
  return slotId === "lead1" || slotId === "lead2";
}

/**
 * Який User.id має бути в User.leadId для користувача в цьому слоті (згідно org-chart).
 * Для lead1/lead2/admin-manager та невідомих слотів — null.
 */
export function desiredLeadUserIdForOrgSlot(
  slotId: string,
  assignments: Record<string, string | null | undefined>,
): string | null {
  if (isOrgChartLeadSlot(slotId)) return null;
  const parentSlot = resolveLeadSlotId(slotId);
  if (!parentSlot) return null;
  const v = assignments[parentSlot];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function slotPriority(slotId: string): number {
  if (slotId === "admin-manager") return 10;
  const m = slotId.match(/^m(\d+)-(\d+)$/);
  if (m) {
    const group = Number.parseInt(m[1] ?? "99", 10);
    const index = Number.parseInt(m[2] ?? "99", 10);
    return 100 + group * 100 + index;
  }
  if (slotId === "lead1") return 900;
  if (slotId === "lead2") return 910;
  return 1000;
}

export function buildRegionAssignments(org: OrgChartStructure): Map<string, RegionAssignment> {
  const byRegion = new Map<string, RegionAssignment>();
  const sortedEntries = Object.entries(org.regions ?? {}).sort(([a], [b]) => {
    const pa = slotPriority(a);
    const pb = slotPriority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
  for (const [slotId, slotRegions] of sortedEntries) {
    const managerId = org.assignments?.[slotId] ?? null;
    if (!managerId) continue;
    const leadSlotId = resolveLeadSlotId(slotId);
    const leadId = leadSlotId ? org.assignments?.[leadSlotId] ?? null : null;
    for (const rawRegion of slotRegions ?? []) {
      const canonicalRegion = canonicalizeRegionName(rawRegion);
      if (!canonicalRegion) continue;
      if (byRegion.has(canonicalRegion)) continue;
      byRegion.set(canonicalRegion, {
        region: canonicalRegion,
        slotId,
        managerId,
        leadSlotId,
        leadId,
      });
    }
  }
  return byRegion;
}

export function resolveAssignedManagerForRegion(
  org: OrgChartStructure,
  region: string,
): RegionAssignment | null {
  const canonical = canonicalizeRegionName(region);
  if (!canonical) return null;
  return buildRegionAssignments(org).get(canonical) ?? null;
}

