import {
  isTrackEligibleForCompensation,
  MIN_TRACK_COMPENSATION_KM,
  type TrackCompensationInput,
} from "../visits/route-routing.util";

/** Snapshot marker so getOrCreateDay migrates DRAFT/REJECTED off GPS payout. */
export const FUEL_PAYOUT_POLICY = "plan_primary_gps_display";
/** Confirmed-plan / stop-share: pay subset OSRM for DONE plan stops, not full plan for 1 DONE. */
export const FUEL_PAYOUT_POLICY_VERSION = "plan_primary_gps_display_v2.1";

/**
 * Plan payout requires at least one DONE visit.
 * Override with FUEL_PLAN_PAYOUT_REQUIRES_DONE_VISIT=0|false|off.
 */
export const FUEL_PLAN_PAYOUT_REQUIRES_DONE_VISIT = true;

export type FuelPayoutKind = "planned" | "fact_visits" | "none";

export type CompensationPayoutResult = {
  kind: FuelPayoutKind;
  compensationKm: number | null;
  payoutReason: string;
  warnings: string[];
  ineligibleReason: string | null;
  /** Confirmed plan stops (DONE ∩ plan, plan order). */
  confirmedStopCount: number;
  /** Total stops on the route plan. */
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
  /** DONE visit ids for the day (any order). */
  doneVisitIds: string[];
  /**
   * OSRM km for home → confirmed plan stops (plan order) → home.
   * Required for partial days; ignored when all plan stops are DONE (use plannedKm).
   */
  partialPlanKm?: number | null;
  visitTrackContradiction?: boolean;
  requiresDoneVisit?: boolean;
};

function kmUsable(km: number | null | undefined): km is number {
  return km != null && Number.isFinite(km) && km >= MIN_TRACK_COMPENSATION_KM;
}

export function planPayoutRequiresDoneVisit(): boolean {
  const raw = process.env.FUEL_PLAN_PAYOUT_REQUIRES_DONE_VISIT?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return FUEL_PLAN_PAYOUT_REQUIRES_DONE_VISIT;
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
 * Money policy (stop-share):
 * - Valid OSRM plan + all stops DONE + no extras → full plannedKm
 * - Valid OSRM plan + some stops DONE + no extras → partialPlanKm (subset OSRM)
 * - Extras / no plan / degraded plan → fact_visits
 * - 0 DONE or contradiction → none
 * Never fact_gps.
 */
export function selectCompensationPayout(input: CompensationPayoutInput): CompensationPayoutResult {
  const planVisitIds = input.planVisitIds ?? [];
  const doneVisitIds = input.doneVisitIds ?? [];
  const confirmedIds = confirmedPlanVisitIds(planVisitIds, doneVisitIds);
  const extras = extraDoneVisitIds(planVisitIds, doneVisitIds);
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

  const requireDone = input.requiresDoneVisit ?? planPayoutRequiresDoneVisit();
  if (requireDone && doneVisitIds.length === 0) {
    const hadPlan =
      kmUsable(input.plannedKm) ||
      input.plannedSource === "osrm" ||
      planVisitIds.length > 0;
    return {
      kind: "none",
      compensationKm: null,
      payoutReason: hadPlan ? "none_plan_without_done" : "none_no_plan_no_visits",
      warnings: hadPlan ? ["plan_without_completed_visits"] : ["compensation_review_required"],
      ineligibleReason: hadPlan ? "plan_without_completed_visits" : "compensation_unavailable",
      ...counts,
    };
  }

  if (input.visitTrackContradiction) {
    return {
      kind: "none",
      compensationKm: null,
      payoutReason: "none_visit_track_contradiction",
      warnings: ["visit_closed_off_address_unconfirmed"],
      ineligibleReason: "visit_track_contradiction",
      ...counts,
    };
  }

  const visitsOk = kmUsable(input.visitRouteKm);
  const planKm = input.plannedKm;
  const planIsOsrm = input.plannedSource === "osrm";
  const planOk = kmUsable(planKm) && !input.plannedDegraded && planIsOsrm && planVisitIds.length > 0;

  if (planOk && extras.length > 0) {
    if (visitsOk) {
      return {
        kind: "fact_visits",
        compensationKm: input.visitRouteKm,
        payoutReason: "fact_visits_extras",
        warnings: [],
        ineligibleReason: null,
        ...counts,
      };
    }
    return {
      kind: "none",
      compensationKm: null,
      payoutReason: "none_extras_no_visit_route",
      warnings: ["compensation_review_required"],
      ineligibleReason: "compensation_unavailable",
      ...counts,
    };
  }

  if (planOk && confirmedIds.length > 0 && extras.length === 0) {
    const allDone = confirmedIds.length === planVisitIds.length;
    if (allDone) {
      return {
        kind: "planned",
        compensationKm: planKm,
        payoutReason: "planned_osrm_complete",
        warnings: [],
        ineligibleReason: null,
        ...counts,
      };
    }

    if (kmUsable(input.partialPlanKm)) {
      return {
        kind: "planned",
        compensationKm: input.partialPlanKm,
        payoutReason: `planned_osrm_partial=${confirmedIds.length}/${planVisitIds.length}`,
        warnings: [],
        ineligibleReason: null,
        ...counts,
      };
    }

    // Partial day but subset OSRM failed → fall through to visits if possible.
    if (visitsOk) {
      return {
        kind: "fact_visits",
        compensationKm: input.visitRouteKm,
        payoutReason: "fact_visits_partial_osrm_failed",
        warnings: [],
        ineligibleReason: null,
        ...counts,
      };
    }
  }

  if (visitsOk) {
    const reason =
      !planIsOsrm && kmUsable(planKm)
        ? "fact_visits_plan_not_osrm"
        : input.plannedDegraded && kmUsable(planKm)
          ? "fact_visits_plan_degraded"
          : planVisitIds.length === 0
            ? "fact_visits_no_plan"
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

/** GPS issues for the snapshot/UI — never change payout kind (except contradiction handled in selector). */
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
