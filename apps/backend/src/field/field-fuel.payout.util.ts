import {
  isTrackEligibleForCompensation,
  MIN_TRACK_COMPENSATION_KM,
  type TrackCompensationInput,
} from "../visits/route-routing.util";

/** Snapshot marker so getOrCreateDay migrates DRAFT/REJECTED off GPS payout. */
export const FUEL_PAYOUT_POLICY = "plan_primary_gps_display";
/**
 * Full OSRM plan when valid; GPS/contradiction/extras/DONE count do not change money.
 * Bump so DRAFT/REJECTED remigrate via getOrCreateDay.
 */
export const FUEL_PAYOUT_POLICY_VERSION = "plan_primary_gps_display_v2.2";

/**
 * @deprecated Money path no longer uses DONE-guard. Kept for callers/tests that still
 * pass `requiresDoneVisit`; selector ignores it.
 */
export const FUEL_PLAN_PAYOUT_REQUIRES_DONE_VISIT = false;

export type FuelPayoutKind = "planned" | "fact_visits" | "none";

export type CompensationPayoutResult = {
  kind: FuelPayoutKind;
  compensationKm: number | null;
  payoutReason: string;
  warnings: string[];
  ineligibleReason: string | null;
  /** Confirmed plan stops (DONE ∩ plan, plan order) — informational only. */
  confirmedStopCount: number;
  /** Total stops on the route plan — informational only. */
  planStopCount: number;
};

export type CompensationPayoutInput = {
  mobilityMode?: "CAR" | "WALK_TRANSIT" | null;
  plannedKm: number | null;
  plannedDegraded: boolean;
  plannedSource: "osrm" | "fallback" | "none" | string;
  visitRouteKm: number | null;
  /** RoutePlan stop visit ids in position order. */
  planVisitIds: string[];
  /** DONE visit ids for the day (any order). Snapshot counts only. */
  doneVisitIds: string[];
  /** Ignored for money (v2.2 pays full plan). Kept for API compatibility. */
  partialPlanKm?: number | null;
  /** Ignored for money — warning via collectFuelGpsWarnings only. */
  visitTrackContradiction?: boolean;
  /** Ignored for money (v2.2). */
  requiresDoneVisit?: boolean;
};

function kmUsable(km: number | null | undefined): km is number {
  return km != null && Number.isFinite(km) && km >= MIN_TRACK_COMPENSATION_KM;
}

/** @deprecated Selector no longer reads DONE-guard for money. */
export function planPayoutRequiresDoneVisit(): boolean {
  return false;
}

/** Plan stops that were DONE, preserving plan order. */
export function confirmedPlanVisitIds(planVisitIds: string[], doneVisitIds: string[]): string[] {
  const done = new Set(doneVisitIds);
  return planVisitIds.filter((id) => done.has(id));
}

/** DONE visits that are not on the route plan (adhoc / extras). */
export function extraDoneVisitIds(planVisitIds: string[], doneVisitIds: string[]): string[] {
  const plan = new Set(planVisitIds);
  return doneVisitIds.filter((id) => !plan.has(id));
}

function emptyCounts(planVisitIds: string[], confirmed: number): Pick<
  CompensationPayoutResult,
  "confirmedStopCount" | "planStopCount"
> {
  return {
    confirmedStopCount: confirmed,
    planStopCount: planVisitIds.length,
  };
}

/**
 * Money policy v2.2 (prod override):
 * - WALK_TRANSIT → none
 * - Valid OSRM plan → full plannedKm (planned_osrm_full)
 * - Else visitRouteKm → fact_visits
 * - Else none
 * Never fact_gps. Contradiction / extras / partial / 0 DONE do not change money.
 */
export function selectCompensationPayout(input: CompensationPayoutInput): CompensationPayoutResult {
  const planVisitIds = input.planVisitIds ?? [];
  const doneVisitIds = input.doneVisitIds ?? [];
  const confirmedIds = confirmedPlanVisitIds(planVisitIds, doneVisitIds);
  const counts = emptyCounts(planVisitIds, confirmedIds.length);

  if (input.mobilityMode === "WALK_TRANSIT") {
    return {
      kind: "none",
      compensationKm: null,
      payoutReason: "none_non_vehicle_day",
      warnings: ["non_vehicle_day"],
      ineligibleReason: "non_vehicle_day",
      ...counts,
    };
  }

  const planKm = input.plannedKm;
  const planOk =
    kmUsable(planKm) &&
    !input.plannedDegraded &&
    input.plannedSource === "osrm" &&
    planVisitIds.length > 0;

  if (planOk) {
    return {
      kind: "planned",
      compensationKm: planKm,
      payoutReason: "planned_osrm_full",
      warnings: [],
      ineligibleReason: null,
      ...counts,
    };
  }

  if (kmUsable(input.visitRouteKm)) {
    const reason =
      input.plannedSource !== "osrm" && kmUsable(planKm)
        ? "fact_visits_plan_not_osrm"
        : input.plannedDegraded && kmUsable(planKm)
          ? "fact_visits_plan_degraded"
          : "fact_visits_no_plan";
    return {
      kind: "fact_visits",
      compensationKm: input.visitRouteKm,
      payoutReason: reason,
      warnings: [],
      ineligibleReason: null,
      ...counts,
    };
  }

  return {
    kind: "none",
    compensationKm: null,
    payoutReason: "none_no_plan_no_visits",
    warnings: ["compensation_review_required"],
    ineligibleReason: "compensation_unavailable",
    ...counts,
  };
}

/** GPS / audit issues for snapshot/UI — never change payout kind or km. */
export function collectFuelGpsWarnings(
  opts: TrackCompensationInput & {
    visitTrackContradiction?: boolean;
    factGpsSource?: string | null;
  },
): string[] {
  const warnings: string[] = [];
  if (opts.visitTrackContradiction) {
    warnings.push("visit_closed_off_address_unconfirmed");
  }
  if (opts.snapFailureReason === "gps_snap_loop_collapse") {
    warnings.push("gps_snap_loop_collapse");
  }
  if (opts.plannedKmWarning) {
    warnings.push(opts.plannedKmWarning);
  }

  const eligibility = isTrackEligibleForCompensation(opts);
  if (!eligibility.eligible && eligibility.reason) {
    warnings.push(eligibility.reason);
  }

  if (opts.factGpsSource === "none") {
    warnings.push("gps_track_unavailable");
  }

  return [...new Set(warnings)];
}
