export type ReceivablesTab = "work" | "reconcile";
export type ReceivablesWorkView = "clients" | "orders";

export type ReceivablesFilterState = {
  tab: ReceivablesTab;
  workView: ReceivablesWorkView;
  overdue: boolean;
  needsComment: boolean;
  deltasOnly: boolean;
  reconcileStatus: string;
  snapshotId: string;
  ownerId: string;
  q: string;
  clientId: string;
  promisedToday: boolean;
  promiseBroken: boolean;
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
  return {
    tab: sp.get("tab") === "reconcile" ? "reconcile" : "work",
    workView: sp.get("view") === "orders" ? "orders" : "clients",
    overdue: sp.get("overdue") === "true",
    needsComment: sp.get("needsComment") === "true",
    // Specific status wins over the coarse "deltas only" flag so they never both apply.
    reconcileStatus,
    deltasOnly: reconcileStatus ? false : sp.get("deltasOnly") === "true",
    snapshotId: (sp.get("snapshotId") ?? "").trim(),
    ownerId: (sp.get("ownerId") ?? "").trim(),
    q: (sp.get("q") ?? "").trim(),
    clientId: (sp.get("clientId") ?? "").trim(),
    promisedToday: sp.get("promisedToday") === "true",
    promiseBroken: sp.get("promiseBroken") === "true",
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
  if (state.ownerId) params.set("ownerId", state.ownerId);
  if (state.q) params.set("q", state.q);
  if (state.clientId && state.workView === "orders") params.set("clientId", state.clientId);
  if (state.promisedToday && state.workView !== "orders") params.set("promisedToday", "true");
  if (state.promiseBroken && state.workView !== "orders") params.set("promiseBroken", "true");
  return params;
}
