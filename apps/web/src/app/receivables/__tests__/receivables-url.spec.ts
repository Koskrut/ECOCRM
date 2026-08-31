import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceivablesSearchParams,
  parseReceivablesFilters,
  type ReceivablesUrlState,
} from "../receivables-url";

function fromQuery(query: string) {
  return parseReceivablesFilters(new URLSearchParams(query));
}

const emptyUrl: ReceivablesUrlState = {
  tab: "work",
  workView: "clients",
  overdue: false,
  needsComment: false,
  deltasOnly: false,
  reconcileStatus: "",
  snapshotId: "",
  ownerId: "",
  q: "",
  clientId: "",
  promisedToday: false,
  promiseBroken: false,
  contactId: "",
  orderId: "",
};

test("parseReceivablesFilters defaults to work/clients", () => {
  const parsed = fromQuery("");
  assert.equal(parsed.tab, "work");
  assert.equal(parsed.workView, "clients");
  assert.equal(parsed.overdue, false);
  assert.equal(parsed.deltasOnly, false);
});

test("parseReceivablesFilters drops deltasOnly when a status is set", () => {
  const parsed = fromQuery("tab=reconcile&deltasOnly=true&status=ONLY_1C");
  assert.equal(parsed.deltasOnly, false);
  assert.equal(parsed.reconcileStatus, "ONLY_1C");
});

test("buildReceivablesSearchParams does not write both status and deltasOnly", () => {
  const params = buildReceivablesSearchParams({
    ...emptyUrl,
    tab: "reconcile",
    snapshotId: "snap-1",
    deltasOnly: true,
    reconcileStatus: "ONLY_CRM",
  });
  assert.equal(params.get("status"), "ONLY_CRM");
  assert.equal(params.get("deltasOnly"), null);
});

test("buildReceivablesSearchParams writes deltasOnly only without status", () => {
  const params = buildReceivablesSearchParams({
    ...emptyUrl,
    tab: "reconcile",
    snapshotId: "snap-1",
    deltasOnly: true,
  });
  assert.equal(params.get("deltasOnly"), "true");
  assert.equal(params.get("status"), null);
});

test("clientId is kept only on orders view", () => {
  const onOrders = buildReceivablesSearchParams({
    ...emptyUrl,
    workView: "orders",
    clientId: "c1",
  });
  assert.equal(onOrders.get("clientId"), "c1");

  const onClients = buildReceivablesSearchParams({
    ...emptyUrl,
    workView: "clients",
    clientId: "c1",
  });
  assert.equal(onClients.get("clientId"), null);
});

test("modal ids do not drop list filters", () => {
  const params = buildReceivablesSearchParams({
    ...emptyUrl,
    overdue: true,
    ownerId: "m1",
    q: "acme",
    contactId: "c9",
  });
  assert.equal(params.get("overdue"), "true");
  assert.equal(params.get("ownerId"), "m1");
  assert.equal(params.get("q"), "acme");
  assert.equal(params.get("contactId"), "c9");
  assert.equal(params.get("orderId"), null);
});

test("promisedToday stays on clients view and is dropped on orders", () => {
  const onClients = buildReceivablesSearchParams({
    ...emptyUrl,
    promisedToday: true,
  });
  assert.equal(onClients.get("promisedToday"), "true");
  const onOrders = buildReceivablesSearchParams({
    ...emptyUrl,
    workView: "orders",
    promisedToday: true,
  });
  assert.equal(onOrders.get("promisedToday"), null);
});

test("modal ids keep reconcile tab", () => {
  const params = buildReceivablesSearchParams({
    ...emptyUrl,
    tab: "reconcile",
    snapshotId: "snap-1",
    deltasOnly: true,
    contactId: "c9",
  });
  assert.equal(params.get("tab"), "reconcile");
  assert.equal(params.get("snapshotId"), "snap-1");
  assert.equal(params.get("deltasOnly"), "true");
  assert.equal(params.get("contactId"), "c9");
});

test("round-trip preserves work filters", () => {
  const original: ReceivablesUrlState = {
    tab: "work",
    workView: "orders",
    overdue: true,
    needsComment: true,
    deltasOnly: false,
    reconcileStatus: "",
    snapshotId: "snap-1",
    ownerId: "m1",
    q: "код",
    clientId: "c1",
    promisedToday: true,
    promiseBroken: false,
    contactId: "",
    orderId: "o1",
  };
  const parsed = parseReceivablesFilters(buildReceivablesSearchParams(original));
  assert.equal(parsed.tab, "work");
  assert.equal(parsed.workView, "orders");
  assert.equal(parsed.overdue, true);
  assert.equal(parsed.needsComment, false);
  assert.equal(parsed.ownerId, "m1");
  assert.equal(parsed.q, "код");
  assert.equal(parsed.clientId, "c1");
  assert.equal(parsed.promisedToday, false);
});
