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

export type OrgLeadChartRoot = "lead1" | "lead2";

/** У якому слоті lead1/lead2 зараз стоїть цей керівник (LEAD/ADMIN). */
export function leadRootSlotForLeadUser(
  assignments: Record<string, string | null | undefined>,
  leadUserId: string,
): OrgLeadChartRoot | null {
  const id = leadUserId.trim();
  if (!id) return null;
  const a1 = assignments.lead1 != null ? String(assignments.lead1).trim() : "";
  const a2 = assignments.lead2 != null ? String(assignments.lead2).trim() : "";
  if (a1 === id) return "lead1";
  if (a2 === id) return "lead2";
  return null;
}

function compareManagerSlotIds(a: string, b: string): number {
  const pa = a.match(/^m(\d+)-(\d+)$/);
  const pb = b.match(/^m(\d+)-(\d+)$/);
  if (!pa || !pb) return a.localeCompare(b);
  const ga = Number.parseInt(pa[1] ?? "0", 10);
  const gb = Number.parseInt(pb[1] ?? "0", 10);
  if (ga !== gb) return ga - gb;
  return Number.parseInt(pa[2] ?? "0", 10) - Number.parseInt(pb[2] ?? "0", 10);
}

/** Слоти m1-* / m2-* (базові + extra) у стабільному порядку. */
export function managerSlotsUnderLeadRoot(leadRoot: OrgLeadChartRoot, extraSlots: string[]): string[] {
  const prefix = leadRoot === "lead1" ? "m1-" : "m2-";
  const base = leadRoot === "lead1" ? ["m1-1", "m1-2"] : ["m2-1", "m2-2"];
  const fromExtra = extraSlots.filter((s) => s.startsWith(prefix));
  return [...new Set([...base, ...fromExtra])].sort(compareManagerSlotIds);
}

/**
 * Перший вільний слот під гілку або новий m*-N у extraSlots.
 */
export function allocateManagerSlotForLeadRoot(
  leadRoot: OrgLeadChartRoot,
  extraSlots: string[],
  assignments: Record<string, string | null>,
): { slotId: string; extraSlots: string[] } {
  const prefix = leadRoot === "lead1" ? "m1-" : "m2-";
  const slots = managerSlotsUnderLeadRoot(leadRoot, extraSlots);
  const empty = slots.find((s) => {
    const v = assignments[s];
    return v == null || String(v).trim() === "";
  });
  if (empty) return { slotId: empty, extraSlots };
  let maxN = 2;
  for (const s of slots) {
    const m = s.match(/^m(\d+)-(\d+)$/);
    if (m && m[1] === (leadRoot === "lead1" ? "1" : "2")) {
      maxN = Math.max(maxN, Number.parseInt(m[2] ?? "0", 10));
    }
  }
  const slotId = `${prefix}${maxN + 1}`;
  if (extraSlots.includes(slotId)) return { slotId, extraSlots };
  return { slotId, extraSlots: [...extraSlots, slotId] };
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

const DEFAULT_MANAGER_REGION = "Київська";

/** First org-chart region assigned to the manager; fallback when none. */
export function resolvePrimaryRegionForManager(
  org: OrgChartStructure,
  managerId: string,
): string {
  const id = managerId.trim();
  if (!id) return DEFAULT_MANAGER_REGION;
  for (const assignment of buildRegionAssignments(org).values()) {
    if (assignment.managerId === id) return assignment.region;
  }
  return DEFAULT_MANAGER_REGION;
}

