import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedNextForStage,
  FALLBACK_ALLOWED_TRANSITIONS,
  getKanbanDropBlock,
  isFinalOrderStage,
  isForwardStageTransition,
  resolveStage,
} from "../orders-kanban.util";

test("legacy IN_WORK without orderStage resolves to CONFIRMED", () => {
  assert.equal(resolveStage({ orderStage: null, status: "IN_WORK" }), "CONFIRMED");
});

test("explicit CONFIRMED orderStage stays CONFIRMED", () => {
  assert.equal(resolveStage({ orderStage: "CONFIRMED", status: "IN_WORK" }), "CONFIRMED");
});

test("isForwardStageTransition treats COMPLETED as forward and CANCELED as not", () => {
  assert.equal(isForwardStageTransition("RECEIVED", "COMPLETED"), true);
  assert.equal(isForwardStageTransition("NEW", "CANCELED"), false);
  assert.equal(isForwardStageTransition("NEW", "AWAITING_STOCK"), true);
  assert.equal(isForwardStageTransition("CONFIRMED", "AWAITING_STOCK"), false);
});

test("isFinalOrderStage covers closed swimlanes", () => {
  assert.equal(isFinalOrderStage("COMPLETED"), true);
  assert.equal(isFinalOrderStage("NEW"), false);
});

test("getKanbanDropBlock rejects targets outside allowedNext", () => {
  assert.equal(
    getKanbanDropBlock({
      from: "NEW",
      to: "COMPLETED",
      paymentType: "PREPAYMENT",
      allowedNext: FALLBACK_ALLOWED_TRANSITIONS.NEW,
    }),
    "not_allowed",
  );
});

test("getKanbanDropBlock requires payment type on forward moves", () => {
  assert.equal(
    getKanbanDropBlock({
      from: "NEW",
      to: "AWAITING_STOCK",
      paymentType: null,
      allowedNext: FALLBACK_ALLOWED_TRANSITIONS.NEW,
    }),
    "payment_type",
  );
});

test("getKanbanDropBlock enforces prepayment path from NEW", () => {
  assert.equal(
    getKanbanDropBlock({
      from: "NEW",
      to: "AWAITING_STOCK",
      paymentType: "PREPAYMENT",
      allowedNext: FALLBACK_ALLOWED_TRANSITIONS.NEW,
    }),
    "prepay_must_await_payment",
  );
  assert.equal(
    getKanbanDropBlock({
      from: "NEW",
      to: "AWAITING_PAYMENT",
      paymentType: "DEFERRED",
      allowedNext: FALLBACK_ALLOWED_TRANSITIONS.NEW,
    }),
    "deferred_no_awaiting_payment",
  );
});

test("getKanbanDropBlock blocks COMPLETED when debt remains", () => {
  assert.equal(
    getKanbanDropBlock({
      from: "RECEIVED",
      to: "COMPLETED",
      paymentType: "DEFERRED",
      debtAmount: 10,
      allowedNext: FALLBACK_ALLOWED_TRANSITIONS.RECEIVED,
    }),
    "complete_debt",
  );
  assert.equal(
    getKanbanDropBlock({
      from: "RECEIVED",
      to: "COMPLETED",
      paymentType: "DEFERRED",
      debtAmount: 0,
      allowedNext: FALLBACK_ALLOWED_TRANSITIONS.RECEIVED,
    }),
    null,
  );
});

test("warehouse restriction intersects pipeline graph", () => {
  assert.deepEqual(allowedNextForStage("CONFIRMED", FALLBACK_ALLOWED_TRANSITIONS.CONFIRMED, true), [
    "READY_TO_SHIP",
    "AWAITING_STOCK",
  ]);
  assert.deepEqual(allowedNextForStage("NEW", FALLBACK_ALLOWED_TRANSITIONS.NEW, true), []);
  assert.deepEqual(allowedNextForStage("READY_TO_SHIP", FALLBACK_ALLOWED_TRANSITIONS.READY_TO_SHIP, true), [
    "CONFIRMED",
  ]);
});
