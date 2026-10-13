import assert from "node:assert/strict";
import test from "node:test";
import {
  compareWorkClients,
  matchesWorkClientQuery,
  parseWorkClientsSort,
} from "../receivables-work-clients.util";

const row = (over: Partial<Parameters<typeof compareWorkClients>[0]> & { id: string }) => ({
  debtAmount: 0,
  overdueAmount: 0,
  overdueDays: 0,
  lastPaymentAt: null as string | null,
  lastCommentAt: null as string | null,
  ...over,
});

test("parseWorkClientsSort defaults to debt desc", () => {
  assert.deepEqual(parseWorkClientsSort(), { key: "debt", dir: "desc" });
  assert.deepEqual(parseWorkClientsSort("nope", "up"), { key: "debt", dir: "desc" });
  assert.deepEqual(parseWorkClientsSort("overdueDays", "asc"), { key: "overdueDays", dir: "asc" });
});

test("sorts with nulls last and debt tie-break", () => {
  const rows = [
    row({ id: "a", debtAmount: 10, lastPaymentAt: null }),
    row({ id: "b", debtAmount: 5, lastPaymentAt: "2026-10-01T00:00:00.000Z" }),
    row({ id: "c", debtAmount: 20, lastPaymentAt: "2026-09-01T00:00:00.000Z" }),
  ];
  const asc = [...rows].sort((x, y) => compareWorkClients(x, y, { key: "lastPayment", dir: "asc" }));
  assert.deepEqual(asc.map((r) => r.id), ["c", "b", "a"]);
  const desc = [...rows].sort((x, y) => compareWorkClients(x, y, { key: "lastPayment", dir: "desc" }));
  assert.deepEqual(desc.map((r) => r.id), ["b", "c", "a"]);
  const days = [row({ id: "x", overdueDays: 3, debtAmount: 1 }), row({ id: "y", overdueDays: 3, debtAmount: 9 })];
  days.sort((x, y) => compareWorkClients(x, y, { key: "overdueDays", dir: "desc" }));
  assert.deepEqual(days.map((r) => r.id), ["y", "x"]);
});

test("query matches name, code and phone digits", () => {
  const r = { clientName: "Іван Петров", externalCode: "000123", phone: "+38 (067) 123-45-67" };
  assert.equal(matchesWorkClientQuery(r, "петров"), true);
  assert.equal(matchesWorkClientQuery(r, "0001"), true);
  assert.equal(matchesWorkClientQuery(r, "0671234"), true);
  assert.equal(matchesWorkClientQuery(r, "067 123 45"), true);
  assert.equal(matchesWorkClientQuery(r, "99"), false);
  assert.equal(matchesWorkClientQuery({ ...r, phone: null }, "0671234"), false);
});
