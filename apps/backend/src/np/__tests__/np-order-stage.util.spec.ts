import assert from "node:assert/strict";
import test from "node:test";
import { legacyStatusToOrderStage } from "../../orders/order-status-sync.mapper";
import {
  legacyStatusForNpSync,
  mapNpTrackingToLegacyStatus,
  orderStageAfterFirstTtnFromNew,
  resolveNpOrderStageUpdate,
} from "../np-order-stage.util";

const createdText =
  "Відправник самостійно створив цю накладну, але ще не надав до відправки";

test("NP code 1 / created-not-handed-over does not map to IN_WORK", () => {
  assert.equal(mapNpTrackingToLegacyStatus({ npCode: "1", npText: createdText }), null);
  assert.equal(mapNpTrackingToLegacyStatus({ npCode: 1, npText: "Накладна створена" }), null);
  assert.equal(
    mapNpTrackingToLegacyStatus({ npText: "Накладная создана, но не передана" }),
    null,
  );
});

test("created-not-handed-over does not change orderStage, including from NEW", () => {
  const mapped = mapNpTrackingToLegacyStatus({ npCode: "1", npText: createdText });
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "NEW",
      currentLegacy: "NEW",
      mappedLegacy: mapped,
    }),
    null,
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "AWAITING_STOCK",
      currentLegacy: "IN_WORK",
      mappedLegacy: "IN_WORK",
    }),
    null,
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "AWAITING_PAYMENT",
      currentLegacy: legacyStatusForNpSync({
        status: "NEW",
        orderStage: "AWAITING_PAYMENT",
        debtAmount: 100,
      }),
      mappedLegacy: "IN_WORK",
    }),
    null,
  );
});

test("stale Order.status NEW does not override AWAITING_STOCK", () => {
  assert.equal(
    legacyStatusForNpSync({
      status: "NEW",
      orderStage: "AWAITING_STOCK",
      debtAmount: 0,
    }),
    "IN_WORK",
  );
});

test("first TTN from NEW is AWAITING_PAYMENT or AWAITING_STOCK, never CONFIRMED", () => {
  assert.equal(
    orderStageAfterFirstTtnFromNew({
      paymentType: "PREPAYMENT",
      paidAmount: 0,
      totalAmount: 100,
    }),
    "AWAITING_PAYMENT",
  );
  assert.equal(
    orderStageAfterFirstTtnFromNew({
      paymentType: "PREPAYMENT",
      paidAmount: 100,
      totalAmount: 100,
    }),
    "AWAITING_STOCK",
  );
  assert.equal(
    orderStageAfterFirstTtnFromNew({
      paymentType: "DEFERRED",
      paidAmount: 0,
      totalAmount: 100,
    }),
    "AWAITING_STOCK",
  );
  assert.notEqual(
    orderStageAfterFirstTtnFromNew({
      paymentType: null,
      paidAmount: 0,
      totalAmount: 0,
    }),
    "CONFIRMED",
  );
});

test("in transit, received, return and cancel still advance the stage", () => {
  assert.equal(
    mapNpTrackingToLegacyStatus({ npCode: "4", npText: "Відправлення прямує до міста" }),
    "SHIPPED",
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "AWAITING_STOCK",
      currentLegacy: "IN_WORK",
      mappedLegacy: "SHIPPED",
    }),
    "SHIPPED",
  );

  assert.equal(
    mapNpTrackingToLegacyStatus({ npCode: "9", npText: "Відправлення отримано", debtAmount: 0 }),
    "SUCCESS",
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "SHIPPED",
      currentLegacy: "SHIPPED",
      mappedLegacy: "SUCCESS",
    }),
    "SUCCESS",
  );
  assert.equal(legacyStatusToOrderStage("SUCCESS"), "COMPLETED");

  assert.equal(
    mapNpTrackingToLegacyStatus({ npCode: "9", npText: "Отримано", debtAmount: 50 }),
    "CONTROL_PAYMENT",
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "SHIPPED",
      currentLegacy: "SHIPPED",
      mappedLegacy: "CONTROL_PAYMENT",
    }),
    "CONTROL_PAYMENT",
  );
  assert.equal(legacyStatusToOrderStage("CONTROL_PAYMENT"), "RECEIVED");

  assert.equal(
    mapNpTrackingToLegacyStatus({ npCode: "102", npText: "Повернення відправлення" }),
    "RETURNING",
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "SHIPPED",
      currentLegacy: "SHIPPED",
      mappedLegacy: "RETURNING",
    }),
    "RETURNING",
  );

  assert.equal(mapNpTrackingToLegacyStatus({ npCode: "2", npText: "Видалено" }), "CANCELED");
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "AWAITING_STOCK",
      currentLegacy: "IN_WORK",
      mappedLegacy: "CANCELED",
    }),
    "CANCELED",
  );
});

test("unchanged stage does not resolve an update", () => {
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "SHIPPED",
      currentLegacy: "SHIPPED",
      mappedLegacy: "SHIPPED",
    }),
    null,
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "COMPLETED",
      currentLegacy: "SUCCESS",
      mappedLegacy: "SHIPPED",
    }),
    null,
  );
});

test("IN_WORK never resolves to CONFIRMED from NP sync", () => {
  assert.equal(legacyStatusToOrderStage("IN_WORK"), "CONFIRMED");
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "NEW",
      currentLegacy: "NEW",
      mappedLegacy: "IN_WORK",
    }),
    null,
  );
  assert.equal(
    resolveNpOrderStageUpdate({
      currentStage: "READY_TO_SHIP",
      currentLegacy: "NEW",
      mappedLegacy: "IN_WORK",
    }),
    null,
  );
});
