import { PlanningDemandMix } from "@prisma/client";

/**
 * Mix kit demand for packing / factory horizons.
 * - HARD_PLUS_FORECAST_BEYOND_COVERED: hard fully + forecast above hard.
 * - MAX_FORECAST_HARD: max(forecast, hard + soft) — soft pipeline participates.
 */
export function mixKitDemand(
  mix: PlanningDemandMix,
  hardNeed: number,
  forecastNeed: number,
  softNeed = 0,
): number {
  const hard = Math.max(0, hardNeed);
  const forecast = Math.max(0, forecastNeed);
  const soft = Math.max(0, softNeed);
  if (mix === PlanningDemandMix.MAX_FORECAST_HARD) {
    return Math.max(forecast, hard + soft);
  }
  return hard + Math.max(0, forecast - hard);
}

/** Kits still needed after on-hand cover (floor at 0). */
export function uncoveredKitDemand(mixedNeed: number, stockKits: number): number {
  return Math.max(0, Math.max(0, mixedNeed) - Math.max(0, stockKits));
}
