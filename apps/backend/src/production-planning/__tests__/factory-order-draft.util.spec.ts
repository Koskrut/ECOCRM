import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveFactoryOrder,
  canAssignFactoryExternalCode,
  canEditFactoryOrder,
} from "../factory-order-draft.util";

test("factory draft can be edited and approved", () => {
  assert.equal(canEditFactoryOrder("DRAFT"), true);
  assert.equal(canApproveFactoryOrder("DRAFT"), true);
  assert.equal(canAssignFactoryExternalCode("DRAFT"), false);
});

test("approved factory order can receive 1C code", () => {
  assert.equal(canEditFactoryOrder("OPEN"), false);
  assert.equal(canApproveFactoryOrder("OPEN"), false);
  assert.equal(canAssignFactoryExternalCode("OPEN"), true);
  assert.equal(canAssignFactoryExternalCode("PARTIAL"), true);
  assert.equal(canAssignFactoryExternalCode("CLOSED"), true);
});

test("cancelled factory order is locked", () => {
  assert.equal(canEditFactoryOrder("CANCELLED"), false);
  assert.equal(canApproveFactoryOrder("CANCELLED"), false);
  assert.equal(canAssignFactoryExternalCode("CANCELLED"), false);
});
