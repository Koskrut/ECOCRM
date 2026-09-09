import { DateTime } from "luxon";
import { CRM_TIME_ZONE, instantToKyivYmd } from "../crm-timezone";
import type { ResolvedPeriod } from "../analytics/utils/analytics-date.util";

/** Calendar windows for the manager month-pulse KPIs (Europe/Kyiv). */
export type ManagerCalendarWindows = {
  /** 1st of current month → end of today (Kyiv). */
  currentMonthToDate: ResolvedPeriod;
  /** Full previous calendar month. */
  previousMonthFull: ResolvedPeriod;
  /** 1st of previous month → same day-of-month as today (capped to month length). */
  previousMonthPace: ResolvedPeriod;
  /** Days elapsed in the current month including today. */
  daysElapsed: number;
  /** Total days in the current calendar month. */
  daysInMonth: number;
  /** Days remaining after today (0 on last day). */
  daysRemaining: number;
};

export function resolveManagerCalendarWindows(now = new Date()): ManagerCalendarWindows {
  const today = DateTime.fromJSDate(now).setZone(CRM_TIME_ZONE).startOf("day");
  const monthStart = today.startOf("month");
  const daysInMonth = today.daysInMonth ?? 30;
  const daysElapsed = today.day;
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const prevMonthAnchor = monthStart.minus({ months: 1 });
  const prevDaysInMonth = prevMonthAnchor.daysInMonth ?? 30;
  const paceDay = Math.min(daysElapsed, prevDaysInMonth);

  return {
    currentMonthToDate: {
      from: monthStart.toJSDate(),
      to: today.endOf("day").toJSDate(),
    },
    previousMonthFull: {
      from: prevMonthAnchor.startOf("month").toJSDate(),
      to: prevMonthAnchor.endOf("month").toJSDate(),
    },
    previousMonthPace: {
      from: prevMonthAnchor.startOf("month").toJSDate(),
      to: prevMonthAnchor.set({ day: paceDay }).endOf("day").toJSDate(),
    },
    daysElapsed,
    daysInMonth,
    daysRemaining,
  };
}

export function coveragePercent(shipped: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((shipped / base) * 1000) / 10;
}

/** Linear pace forecast to month end from MTD value. */
export function forecastFromPace(
  mtd: number,
  daysElapsed: number,
  daysInMonth: number,
): number | null {
  if (daysElapsed <= 0 || daysInMonth <= 0) return null;
  return Math.round((mtd / daysElapsed) * daysInMonth * 100) / 100;
}

export function clientKeyFromIds(
  clientId: string | null | undefined,
  contactId: string | null | undefined,
): string | null {
  const key = clientId?.trim() || contactId?.trim() || null;
  return key || null;
}

/** Inclusive Kyiv YYYY-MM-DD list for a period (for chart zero-fill). */
export function enumerateKyivDays(period: ResolvedPeriod): string[] {
  const start = DateTime.fromJSDate(period.from).setZone(CRM_TIME_ZONE).startOf("day");
  const end = DateTime.fromJSDate(period.to).setZone(CRM_TIME_ZONE).startOf("day");
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
    const ymd = cursor.toISODate();
    if (ymd) days.push(ymd);
  }
  return days;
}

export function kyivYmdOrNull(instant: Date | null | undefined): string | null {
  if (!instant) return null;
  return instantToKyivYmd(instant);
}

export type GrowthLeverStatus = "good" | "watch" | "critical";

export type GrowthLeverDraft = {
  key: string;
  status: GrowthLeverStatus;
  priority: number;
  currentValue: number;
  compareValue: number | null;
  unit: "count" | "percent" | "money" | "ratio";
  href: string;
};

/**
 * Rank diagnostic signals so the UI can show "where I'm underperforming" without guessing.
 * Higher priority = worse / more actionable.
 * Overdue / overduePayments are snapshot-now (not rolling period).
 */
export function buildGrowthLevers(input: {
  coveragePct: number;
  coveragePctPace: number | null;
  conversionPct: number | null;
  conversionPctPrior: number | null;
  avgCheck: number;
  avgCheckPrior: number | null;
  overduePayments: number;
  overdueFollowups: number;
  overdueTasks: number;
  unshippedBase: number;
}): GrowthLeverDraft[] {
  const levers: GrowthLeverDraft[] = [];

  const covDelta = input.coveragePctPace == null ? null : input.coveragePct - input.coveragePctPace;
  levers.push({
    key: "coverage",
    status:
      covDelta == null
        ? input.coveragePct < 20
          ? "watch"
          : "good"
        : covDelta <= -5
          ? "critical"
          : covDelta < 0
            ? "watch"
            : "good",
    priority:
      covDelta == null
        ? input.unshippedBase > 0
          ? 40
          : 10
        : covDelta <= -5
          ? 90
          : covDelta < 0
            ? 70
            : 20,
    currentValue: input.coveragePct,
    compareValue: input.coveragePctPace,
    unit: "percent",
    href: "/contacts?workPreset=attention",
  });

  if (input.conversionPct != null) {
    const convDelta =
      input.conversionPctPrior == null ? null : input.conversionPct - input.conversionPctPrior;
    levers.push({
      key: "conversion",
      status:
        convDelta == null
          ? input.conversionPct < 15
            ? "watch"
            : "good"
          : convDelta <= -5
            ? "critical"
            : convDelta < 0
              ? "watch"
              : "good",
      priority: convDelta == null ? 30 : convDelta <= -5 ? 85 : convDelta < 0 ? 65 : 15,
      currentValue: input.conversionPct,
      compareValue: input.conversionPctPrior,
      unit: "percent",
      href: "/leads",
    });
  }

  if (input.avgCheckPrior != null && input.avgCheckPrior > 0) {
    const avgDeltaPct = ((input.avgCheck - input.avgCheckPrior) / input.avgCheckPrior) * 100;
    levers.push({
      key: "avgCheck",
      status: avgDeltaPct <= -10 ? "critical" : avgDeltaPct < 0 ? "watch" : "good",
      priority: avgDeltaPct <= -10 ? 75 : avgDeltaPct < 0 ? 55 : 12,
      currentValue: input.avgCheck,
      compareValue: input.avgCheckPrior,
      unit: "money",
      href: "/orders",
    });
  }

  if (input.overduePayments > 0) {
    levers.push({
      key: "collection",
      status: input.overduePayments >= 10 ? "critical" : "watch",
      priority: input.overduePayments >= 10 ? 88 : 68,
      currentValue: input.overduePayments,
      compareValue: null,
      unit: "count",
      href: "/receivables?tab=work&view=orders&overdue=true",
    });
  }

  if (input.overdueFollowups > 0 || input.overdueTasks > 0) {
    const overdueTotal = input.overdueFollowups + input.overdueTasks;
    levers.push({
      key: "overdue",
      status: overdueTotal >= 10 ? "critical" : "watch",
      priority: overdueTotal >= 10 ? 95 : 72,
      currentValue: overdueTotal,
      compareValue: null,
      unit: "count",
      href:
        input.overdueFollowups >= input.overdueTasks
          ? "/contacts?workPreset=overdue"
          : "/tasks?attention=overdue",
    });
  }

  return levers.sort((a, b) => b.priority - a.priority).slice(0, 5);
}
