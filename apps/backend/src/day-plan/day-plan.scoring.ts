import type { DayPlanItemKind, DayPlanStatus } from "./day-plan.types";
import { DAY_PLAN_STATUS_THRESHOLDS } from "./day-plan.templates";

export function scoreDayPlanItem(
  kind: DayPlanItemKind,
  fact: number,
  plan: number,
): { plan: number; fact: number; percent: number } {
  if (kind === "zero_target") {
    return {
      plan: 0,
      fact,
      percent: fact <= 0 ? 100 : 0,
    };
  }

  if (plan <= 0) {
    return { plan: 0, fact, percent: 100 };
  }

  const percent = Math.min(100, Math.round((fact / plan) * 100));
  return { plan, fact, percent };
}

export function scoreOverallPercent(
  items: Array<{ weight: number; percent: number }>,
): number {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return 100;
  const weighted = items.reduce((s, i) => s + i.weight * i.percent, 0);
  return Math.round(weighted / totalWeight);
}

export function dayPlanStatusFromPercent(overallPercent: number): DayPlanStatus {
  if (overallPercent >= DAY_PLAN_STATUS_THRESHOLDS.green) return "green";
  if (overallPercent >= DAY_PLAN_STATUS_THRESHOLDS.yellow) return "yellow";
  return "red";
}
