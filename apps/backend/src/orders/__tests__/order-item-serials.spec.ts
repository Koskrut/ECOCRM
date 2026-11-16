import assert from "node:assert/strict";
import test from "node:test";
import {
  SerialNormalizeError,
  enteringShipmentRequiresSerials,
  normalizeSerial,
  serialKey,
  serialQtyGapMessage,
  serialsEditableAtStage,
} from "../order-item-serials";

test("normalizeSerial trims scanner noise and keeps the code", () => {
  assert.equal(normalizeSerial("  AB-12\r"), "AB-12");
  assert.equal(serialKey(normalizeSerial(" ab-12 ")), "AB-12");
});

test("normalizeSerial rejects empty and control characters", () => {
  assert.throws(() => normalizeSerial("  \n"), SerialNormalizeError);
  assert.throws(() => normalizeSerial("A\u0000B"), SerialNormalizeError);
});

test("serials are required only when first entering a ship stage", () => {
  assert.equal(enteringShipmentRequiresSerials("CONFIRMED", "READY_TO_SHIP"), true);
  assert.equal(enteringShipmentRequiresSerials("AWAITING_STOCK", "SHIPPED"), true);
  assert.equal(enteringShipmentRequiresSerials(null, "READY_TO_SHIP"), true);
  assert.equal(enteringShipmentRequiresSerials("CONFIRMED", "AWAITING_STOCK"), false);
  assert.equal(enteringShipmentRequiresSerials("READY_TO_SHIP", "SHIPPED"), false);
  assert.equal(enteringShipmentRequiresSerials("RECEIVED", "COMPLETED"), false);
});

test("serials stay editable on the picking stages", () => {
  assert.equal(serialsEditableAtStage("CONFIRMED"), true);
  assert.equal(serialsEditableAtStage("AWAITING_STOCK"), true);
  assert.equal(serialsEditableAtStage(null), true);
  assert.equal(serialsEditableAtStage("READY_TO_SHIP"), false);
  assert.equal(serialsEditableAtStage("CANCELED"), false);
});

test("qty cannot drop below the number of scanned serials", () => {
  assert.equal(serialQtyGapMessage(5, 5), null);
  assert.equal(serialQtyGapMessage(6, 5), null);
  assert.match(serialQtyGapMessage(3, 5) ?? "", /5/);
});
