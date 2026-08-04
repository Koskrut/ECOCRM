import { PlanningDemandMix } from "@prisma/client";
import { mixKitDemand } from "./demand-mix.util";
import { coverStatus } from "./mrp-quota.util";

/**
 * Own gross = demandMix(hard, velocityForecast, soft) + safetyStock.
 * - velocityForecast = avgMonthly × coverMonths (no soft baked in).
 * - HARD_PLUS: soft×softFactor participates on the forecast side (legacy).
 * - MAX_FORECAST_HARD: soft once via mixKitDemand (not also inside forecast).
 * safetyStock is always additive (not mixed).
 */
export function computeOwnGrossNeed(
  demandMix: PlanningDemandMix,
  hardNeed: number,
  velocityForecast: number,
  softNeed: number,
  safetyStock: number,
  softFactor = 1,
): number {
  const soft = Math.max(0, softNeed);
  const velocity = Math.max(0, velocityForecast);
  const factor = Number.isFinite(softFactor) ? Math.max(0, softFactor) : 1;
  const mixed =
    demandMix === PlanningDemandMix.MAX_FORECAST_HARD
      ? mixKitDemand(demandMix, hardNeed, velocity, soft)
      : mixKitDemand(
          demandMix,
          hardNeed,
          velocity + soft * factor,
          0,
        );
  return Math.max(0, mixed) + Math.max(0, safetyStock);
}

/** Combine independent + kit-dependent gross, then net against supply. */
export function recomputeNetNeed(
  ownGrossNeed: number,
  kitDependentGross: number,
  available: number,
  expectedWip: number,
): { grossNeed: number; netNeed: number } {
  const grossNeed = Math.max(0, ownGrossNeed) + Math.max(0, kitDependentGross);
  const supply = Math.max(0, available) + Math.max(0, expectedWip);
  const netNeed = Math.max(0, Math.ceil(grossNeed - supply));
  return { grossNeed, netNeed };
}

export function hardDeficitQty(hardNeed: number, available: number, expectedWip: number): number {
  return Math.max(0, Math.ceil(hardNeed - available - expectedWip));
}

/**
 * Zero-velocity: coverDays=null, status OK unless hard deficit.
 * Positive velocity: days-of-cover thresholds; hard deficit forces CRITICAL.
 */
export function resolveCoverMetrics(input: {
  available: number;
  avgDailySold: number;
  hardNeed: number;
  expectedWip: number;
  warnCoverDays: number;
  criticalCoverDays: number;
}): {
  coverDays: number | null;
  status: "OK" | "WARN" | "CRITICAL";
  hardDeficit: boolean;
  hardDeficitQty: number;
} {
  const deficitQty = hardDeficitQty(input.hardNeed, input.available, input.expectedWip);
  const hardDeficit = deficitQty > 0;

  if (input.avgDailySold <= 0) {
    return {
      coverDays: null,
      status: hardDeficit ? "CRITICAL" : "OK",
      hardDeficit,
      hardDeficitQty: deficitQty,
    };
  }

  const days = input.available / input.avgDailySold;
  let status = coverStatus(days, input.warnCoverDays, input.criticalCoverDays);
  if (hardDeficit) status = "CRITICAL";
  return {
    coverDays: days,
    status,
    hardDeficit,
    hardDeficitQty: deficitQty,
  };
}

/** Cover risk vs lead time — false when coverDays unknown (zero velocity). */
export function isCoverRisk(coverDays: number | null, leadDays: number): boolean {
  if (coverDays == null || !Number.isFinite(coverDays)) return false;
  return coverDays < leadDays;
}

/**
 * CRITICAL only when there is real quantity (netNeed or hard deficit).
 * Never force qty=1.
 */
export function criticalLineQty(netNeed: number, hardDeficitQtyValue: number): number {
  if (netNeed > 0) return Math.ceil(netNeed);
  if (hardDeficitQtyValue > 0) return Math.ceil(hardDeficitQtyValue);
  return 0;
}

export function shouldEmitCritical(input: {
  status: "OK" | "WARN" | "CRITICAL";
  netNeed: number;
  coverRisk: boolean;
  hardDeficitQty: number;
}): boolean {
  const qty = criticalLineQty(input.netNeed, input.hardDeficitQty);
  if (qty <= 0) return false;
  if (input.status === "CRITICAL") return true;
  if (input.coverRisk && input.hardDeficitQty > 0) return true;
  if (input.netNeed > 0 && input.coverRisk) return true;
  return false;
}
