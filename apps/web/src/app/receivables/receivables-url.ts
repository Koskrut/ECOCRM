import { ymdDaysAgoInKyiv } from "@/lib/crmDatetime";
import type { AgingChip } from "./aging";

export type ReceivablesTab = "work" | "reconcile";
export type ReceivablesWorkView = "clients" | "orders";

const AGING_CHIPS: AgingChip[] = ["0-7", "8-30", "31-60", "90+"];

export function defaultReceivablesPeriodPaid(): { periodPaidFrom: string; periodPaidTo: string } {
  return {
    periodPaidFrom: ymdDaysAgoInKyiv(30),
    periodPaidTo: ymdDaysAgoInKyiv(0),
  };
}

function parseAgingChip(raw: string | null): AgingChip {
  const value = (raw ?? "").trim();
  return AGING_CHIPS.includes(value as AgingChip) ? (value as AgingChip) : "";
}

export type ReceivablesFilterState = {
  tab: ReceivablesTab;
  workView: ReceivablesWorkView;
  overdue: boolean;
  needsComment: boolean;
  deltasOnly: boolean;
  reconcileStatus: string;
  reconcileDeltaOnly: boolean;
  delayReason: string;
  snapshotId: string;
  ownerId: string;
  q: string;
  clientId: string;
  promisedToday: boolean;
  promiseBroken: boolean;
  aging: AgingChip;
  periodPaidFrom: string;
  periodPaidTo: string;
};

export type ReceivablesUrlState = ReceivablesFilterState & {
  contactId: string;
  orderId: string;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
};

export function parseReceivablesFilters(sp: SearchParamsLike): ReceivablesFilterState {
  const reconcileStatus = (sp.get("status") ?? "").trim();
  const defaults = defaultReceivablesPeriodPaid();
  return {
    tab: sp.get("tab") === "reconcile" ? "reconcile" : "work",
    workView: sp.get("view") === "orders" ? "orders" : "clients",
    overdue: sp.get("overdue") === "true",
    needsComment: sp.get("needsComment") === "true",
    // Specific status wins over the coarse "deltas only" flag so they never both apply.
    reconcileStatus,
    deltasOnly: reconcileStatus ? false : sp.get("deltasOnly") === "true",
    reconcileDeltaOnly: sp.get("reconcileDeltaOnly") === "true",
    delayReason: (sp.get("delayReason") ?? "").trim(),
    snapshotId: (sp.get("snapshotId") ?? "").trim(),
    ownerId: (sp.get("ownerId") ?? "").trim(),
    q: (sp.get("q") ?? "").trim(),
    clientId: (sp.get("clientId") ?? "").trim(),
    promisedToday: sp.get("promisedToday") === "true",
    promiseBroken: sp.get("promiseBroken") === "true",
    aging: parseAgingChip(sp.get("aging")),
    periodPaidFrom: (sp.get("periodPaidFrom") ?? "").trim() || defaults.periodPaidFrom,
    periodPaidTo: (sp.get("periodPaidTo") ?? "").trim() || defaults.periodPaidTo,
  };
}

export function buildReceivablesSearchParams(state: ReceivablesUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.contactId) params.set("contactId", state.contactId);
  if (state.orderId) params.set("orderId", state.orderId);
  if (state.tab === "reconcile") params.set("tab", "reconcile");
  if (state.workView === "orders") params.set("view", "orders");
  if (state.overdue) params.set("overdue", "true");
  if (state.needsComment && state.workView !== "orders") params.set("needsComment", "true");
  if (state.tab === "reconcile") {
    if (state.snapshotId) params.set("snapshotId", state.snapshotId);
    if (state.reconcileStatus) params.set("status", state.reconcileStatus);
    else if (state.deltasOnly) params.set("deltasOnly", "true");
  }
  if (state.reconcileDeltaOnly && state.workView !== "orders" && state.tab !== "reconcile") {
    params.set("reconcileDeltaOnly", "true");
  }
  if (state.delayReason && state.workView !== "orders" && state.tab !== "reconcile") {
    params.set("delayReason", state.delayReason);
  }
  if (state.ownerId) params.set("ownerId", state.ownerId);
  if (state.q) params.set("q", state.q);
  if (state.clientId && state.workView === "orders") params.set("clientId", state.clientId);
  if (state.promisedToday && state.workView !== "orders") params.set("promisedToday", "true");
  if (state.promiseBroken && state.workView !== "orders") params.set("promiseBroken", "true");
  if (state.aging && state.workView === "clients" && state.tab === "work") {
    params.set("aging", state.aging);
  }
  const periodDefaults = defaultReceivablesPeriodPaid();
  if (
    state.periodPaidFrom &&
    state.periodPaidFrom !== periodDefaults.periodPaidFrom &&
    state.workView === "clients" &&
    state.tab === "work"
  ) {
    params.set("periodPaidFrom", state.periodPaidFrom);
  }
  if (
    state.periodPaidTo &&
    state.periodPaidTo !== periodDefaults.periodPaidTo &&
    state.workView === "clients" &&
    state.tab === "work"
  ) {
    params.set("periodPaidTo", state.periodPaidTo);
  }
  return params;
}
