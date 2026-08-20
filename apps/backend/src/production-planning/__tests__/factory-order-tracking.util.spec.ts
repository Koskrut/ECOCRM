import assert from "node:assert/strict";
import test from "node:test";
import {
  countOverdueLines,
  effectiveLineDueAt,
  factoryLineTrackingStatus,
  nearestOpenLineDueYmd,
} from "../factory-order-tracking.util";

test("effectiveLineDueAt falls back to order dueAt", () => {
  const orderDue = new Date("2026-11-18T21:59:59.999Z");
  assert.equal(effectiveLineDueAt(null, orderDue).toISOString(), orderDue.toISOString());
  assert.equal(effectiveLineDueAt(undefined, orderDue).toISOString(), orderDue.toISOString());
  const lineDue = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(effectiveLineDueAt(lineDue, orderDue).toISOString(), lineDue.toISOString());
});

test("factoryLineTrackingStatus: received when qty met", () => {
  assert.equal(
    factoryLineTrackingStatus({
      qtyOrdered: 10,
      qtyReceived: 10,
      effectiveDueAt: "2020-01-01",
      todayYmd: "2026-08-20",
    }),
    "received",
  );
});

test("factoryLineTrackingStatus: overdue when due before today and not received", () => {
  assert.equal(
    factoryLineTrackingStatus({
      qtyOrdered: 10,
      qtyReceived: 2,
      effectiveDueAt: "2026-08-10T12:00:00+03:00",
      todayYmd: "2026-08-20",
    }),
    "overdue",
  );
});

test("factoryLineTrackingStatus: due_soon within 7 days", () => {
  assert.equal(
    factoryLineTrackingStatus({
      qtyOrdered: 10,
      qtyReceived: 0,
      effectiveDueAt: "2026-08-25T12:00:00+03:00",
      todayYmd: "2026-08-20",
      dueSoonDays: 7,
    }),
    "due_soon",
  );
});

test("factoryLineTrackingStatus: on_track when far out", () => {
  assert.equal(
    factoryLineTrackingStatus({
      qtyOrdered: 10,
      qtyReceived: 0,
      effectiveDueAt: "2026-11-18T12:00:00+03:00",
      todayYmd: "2026-08-20",
    }),
    "on_track",
  );
});

test("countOverdueLines and nearestOpenLineDueYmd", () => {
  const orderDue = "2026-11-18T12:00:00+03:00";
  const lines = [
    { qtyOrdered: 5, qtyReceived: 5, dueAt: "2026-08-01T12:00:00+03:00" },
    { qtyOrdered: 10, qtyReceived: 0, dueAt: "2026-08-10T12:00:00+03:00" },
    { qtyOrdered: 3, qtyReceived: 0, dueAt: "2026-09-01T12:00:00+03:00" },
  ];
  assert.equal(countOverdueLines(lines, orderDue, "2026-08-20"), 1);
  assert.equal(nearestOpenLineDueYmd(lines, orderDue), "2026-08-10");
});
