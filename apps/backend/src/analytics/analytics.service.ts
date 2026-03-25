import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { buildRegionAssignments, canonicalizeRegionName, type RegionAssignment } from "../settings/org-chart-region-resolver";
import { UKRAINE_REGIONS } from "../store/checkout/uk-regions";
import type { AnalyticsScope } from "./analytics-scope.service";
import { ANALYTICS_REGION_ISO_BY_NAME } from "./analytics-map-region-iso";
import { buildPeriodOrderWhere } from "./utils/analytics-filter.builder";

export type AnalyticsMapPeriod = "week" | "month";
export type AnalyticsMapView = "assigned" | "performance";

export type AnalyticsMapRegionRow = {
  region: string;
  regionIso: string | null;
  clientsCount: number;
  clientsTotalCount: number;
  ordersCount: number;
  salesTotal: number;
  assignedManagerId: string | null;
  assignedManagerName: string | null;
  assignedLeadId: string | null;
  assignedLeadName: string | null;
  assignedSlotId: string | null;
  topManagerId: string | null;
  topManagerName: string | null;
  topManagerSales: number;
  hasAssignment: boolean;
  hasActivity: boolean;
  mismatch: boolean;
};

export type AnalyticsMapManagerSummary = {
  managerId: string;
  managerName: string;
  leadId: string | null;
  leadName: string | null;
  slotId: string | null;
  assignedRegions: string[];
  regionsCount: number;
  activeRegionsCount: number;
  clientsCount: number;
  ordersCount: number;
  salesTotal: number;
  mismatchRegionsCount: number;
};

export type AnalyticsMapResponse = {
  period: { from: string; to: string };
  view: AnalyticsMapView;
  rows: AnalyticsMapRegionRow[];
  managers: AnalyticsMapManagerSummary[];
  totals: {
    totalRegions: number;
    assignedRegions: number;
    activeRegions: number;
    mismatchRegions: number;
    unassignedRegions: number;
  };
};

function getDateRange(period: AnalyticsMapPeriod): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  const days = period === "week" ? 6 : 29;
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function maskAssignmentForLead(
  assignment: RegionAssignment | null,
  actor: AuthUser,
  allowedOwnerIds: string[] | undefined,
): RegionAssignment | null {
  if (actor.role !== UserRole.LEAD || !allowedOwnerIds?.length) return assignment;
  if (!assignment) return null;
  if (allowedOwnerIds.includes(assignment.managerId)) return assignment;
  return null;
}

function pickTopOwner(byOwner: Map<string, { sales: number; name: string }>): {
  id: string | null;
  name: string | null;
  sales: number;
} {
  let topId: string | null = null;
  let topName: string | null = null;
  let maxSales = -1;
  const entries = [...byOwner.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [ownerId, { sales, name }] of entries) {
    if (sales > maxSales) {
      maxSales = sales;
      topId = ownerId;
      topName = name;
    }
  }
  if (topId === null) return { id: null, name: null, sales: 0 };
  return { id: topId, name: topName, sales: Math.max(0, maxSales) };
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getMapResponse(
    period: AnalyticsMapPeriod,
    view: AnalyticsMapView,
    actor: AuthUser,
    scope: AnalyticsScope,
    opts: { managerFilterId?: string | null; problemOnly: boolean },
  ): Promise<AnalyticsMapResponse> {
    const { from, to } = getDateRange(period);
    const problemOnly = opts.problemOnly;
    const managerFilterId = opts.managerFilterId?.trim() || null;

    const emptyTotals = {
      totalRegions: UKRAINE_REGIONS.length,
      assignedRegions: 0,
      activeRegions: 0,
      mismatchRegions: 0,
      unassignedRegions: UKRAINE_REGIONS.length,
    };

    if (scope.emptyTeam) {
      return {
        period: { from: from.toISOString(), to: to.toISOString() },
        view,
        rows: UKRAINE_REGIONS.map((region) => this.emptyRow(region)),
        managers: [],
        totals: emptyTotals,
      };
    }

    const org = await this.settings.getOrgChartStructure();
    const assignmentMap = buildRegionAssignments(org);

    const orderWhere = buildPeriodOrderWhere(from, to, scope.orderScope);
    const orders = await this.prisma.order.findMany({
      where: {
        ...orderWhere,
        clientId: { not: null },
      },
      select: {
        id: true,
        clientId: true,
        totalAmount: true,
        returnAdjustmentAmount: true,
        ownerId: true,
        client: { select: { region: true } },
        owner: { select: { id: true, fullName: true } },
      },
    });

    type RegionAgg = {
      clientIds: Set<string>;
      ordersCount: number;
      salesTotal: number;
      byOwner: Map<string, { sales: number; name: string }>;
    };
    const byRegion = new Map<string, RegionAgg>();

    for (const o of orders) {
      const raw = o.client?.region?.trim() ?? "";
      const canonical = canonicalizeRegionName(raw);
      if (!canonical) continue;

      let agg = byRegion.get(canonical);
      if (!agg) {
        agg = { clientIds: new Set(), ordersCount: 0, salesTotal: 0, byOwner: new Map() };
        byRegion.set(canonical, agg);
      }

      agg.ordersCount += 1;
      if (o.clientId) agg.clientIds.add(o.clientId);
      const effective = Math.max(0, Number(o.totalAmount ?? 0) - Number(o.returnAdjustmentAmount ?? 0));
      agg.salesTotal += effective;

      if (o.ownerId && o.owner) {
        let ownerAgg = agg.byOwner.get(o.ownerId);
        if (!ownerAgg) {
          ownerAgg = { sales: 0, name: o.owner.fullName };
          agg.byOwner.set(o.ownerId, ownerAgg);
        }
        ownerAgg.sales += effective;
      }
    }

    const allClientsByRegion = await this.prisma.contact.groupBy({
      by: ["region"],
      where: { region: { not: null } },
      _count: { _all: true },
    });
    const totalClientsByRegion = new Map<string, number>();
    for (const row of allClientsByRegion) {
      const canonical = canonicalizeRegionName((row.region ?? "").trim());
      if (!canonical) continue;
      totalClientsByRegion.set(canonical, (totalClientsByRegion.get(canonical) ?? 0) + row._count._all);
    }

    const idsForNames = new Set<string>();
    for (const a of assignmentMap.values()) {
      idsForNames.add(a.managerId);
      if (a.leadId) idsForNames.add(a.leadId);
    }

    const nameById = await this.loadUserNames(idsForNames);

    const rows: AnalyticsMapRegionRow[] = [];

    for (const region of UKRAINE_REGIONS) {
      const rawAssign = assignmentMap.get(region) ?? null;
      const masked = maskAssignmentForLead(rawAssign, actor, scope.orderScope.allowedOwnerIds);

      const agg = byRegion.get(region);
      const top = agg ? pickTopOwner(agg.byOwner) : { id: null, name: null, sales: 0 };

      const assignedManagerId = masked?.managerId ?? null;
      const assignedSlotId = masked?.slotId ?? null;
      const assignedLeadId = masked?.leadId ?? null;
      const assignedManagerName = assignedManagerId ? nameById.get(assignedManagerId) ?? null : null;
      const assignedLeadName = assignedLeadId ? nameById.get(assignedLeadId) ?? null : null;

      const clientsCount = agg?.clientIds.size ?? 0;
      const clientsTotalCount = totalClientsByRegion.get(region) ?? 0;
      const ordersCount = agg?.ordersCount ?? 0;
      const salesTotal = agg ? Math.round(agg.salesTotal * 100) / 100 : 0;

      const hasAssignment = Boolean(assignedManagerId);
      const hasActivity = ordersCount > 0;
      const mismatch =
        Boolean(assignedManagerId) &&
        Boolean(top.id) &&
        assignedManagerId !== top.id;

      rows.push({
        region,
        regionIso: ANALYTICS_REGION_ISO_BY_NAME[region] ?? null,
        clientsCount,
        clientsTotalCount,
        ordersCount,
        salesTotal,
        assignedManagerId,
        assignedManagerName,
        assignedLeadId,
        assignedLeadName,
        assignedSlotId,
        topManagerId: top.id,
        topManagerName: top.name,
        topManagerSales: Math.round(top.sales * 100) / 100,
        hasAssignment,
        hasActivity,
        mismatch,
      });
    }

    let filtered = rows;
    if (managerFilterId) {
      filtered = filtered.filter(
        (r) => r.assignedManagerId === managerFilterId || r.topManagerId === managerFilterId,
      );
    }
    if (problemOnly) {
      filtered = filtered.filter((r) => r.mismatch);
    }

    const managers = this.buildManagerSummaries(filtered, nameById);

    const totals = this.computeTotals(rows);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      view,
      rows: filtered,
      managers,
      totals,
    };
  }

  private emptyRow(region: string): AnalyticsMapRegionRow {
    return {
      region,
      regionIso: ANALYTICS_REGION_ISO_BY_NAME[region] ?? null,
      clientsCount: 0,
      clientsTotalCount: 0,
      ordersCount: 0,
      salesTotal: 0,
      assignedManagerId: null,
      assignedManagerName: null,
      assignedLeadId: null,
      assignedLeadName: null,
      assignedSlotId: null,
      topManagerId: null,
      topManagerName: null,
      topManagerSales: 0,
      hasAssignment: false,
      hasActivity: false,
      mismatch: false,
    };
  }

  private async loadUserNames(ids: Set<string>): Promise<Map<string, string>> {
    if (ids.size === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private buildManagerSummaries(
    rows: AnalyticsMapRegionRow[],
    nameById: Map<string, string>,
  ): AnalyticsMapManagerSummary[] {
    const byManager = new Map<
      string,
      {
        slotId: string | null;
        leadId: string | null;
        regions: string[];
        clientsCount: number;
        ordersCount: number;
        salesTotal: number;
        mismatchRegionsCount: number;
      }
    >();

    for (const r of rows) {
      if (!r.assignedManagerId) continue;
      const id = r.assignedManagerId;
      let cur = byManager.get(id);
      if (!cur) {
        cur = {
          slotId: r.assignedSlotId,
          leadId: r.assignedLeadId,
          regions: [],
          clientsCount: 0,
          ordersCount: 0,
          salesTotal: 0,
          mismatchRegionsCount: 0,
        };
        byManager.set(id, cur);
      }
      cur.regions.push(r.region);
      cur.clientsCount += r.clientsCount;
      cur.ordersCount += r.ordersCount;
      cur.salesTotal += r.salesTotal;
      if (r.mismatch) cur.mismatchRegionsCount += 1;
    }

    const out: AnalyticsMapManagerSummary[] = [];
    for (const [managerId, v] of byManager) {
      const activeRegionsCount = [...new Set(v.regions)].filter((reg) => {
        const row = rows.find((x) => x.region === reg);
        return row?.hasActivity;
      }).length;

      out.push({
        managerId,
        managerName: nameById.get(managerId) ?? managerId,
        leadId: v.leadId,
        leadName: v.leadId ? nameById.get(v.leadId) ?? null : null,
        slotId: v.slotId,
        assignedRegions: [...new Set(v.regions)].sort((a, b) => a.localeCompare(b, "uk")),
        regionsCount: new Set(v.regions).size,
        activeRegionsCount,
        clientsCount: v.clientsCount,
        ordersCount: v.ordersCount,
        salesTotal: Math.round(v.salesTotal * 100) / 100,
        mismatchRegionsCount: v.mismatchRegionsCount,
      });
    }

    out.sort((a, b) => b.salesTotal - a.salesTotal);
    return out;
  }

  private computeTotals(rows: AnalyticsMapRegionRow[]) {
    let assignedRegions = 0;
    let activeRegions = 0;
    let mismatchRegions = 0;
    let unassignedRegions = 0;
    for (const r of rows) {
      if (r.hasAssignment) assignedRegions += 1;
      else unassignedRegions += 1;
      if (r.hasActivity) activeRegions += 1;
      if (r.mismatch) mismatchRegions += 1;
    }
    return {
      totalRegions: UKRAINE_REGIONS.length,
      assignedRegions,
      activeRegions,
      mismatchRegions,
      unassignedRegions,
    };
  }
}
