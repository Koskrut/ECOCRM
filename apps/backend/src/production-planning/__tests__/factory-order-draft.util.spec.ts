import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveFactoryOrder,
  canAssignFactoryExternalCode,
  canEditFactoryOrder,
  canEditFactoryOrderLines,
  canEditLineDueAt,
} from "../factory-order-draft.util";

test("factory draft can be edited and approved", () => {
  assert.equal(canEditFactoryOrder("DRAFT"), true);
  assert.equal(canEditFactoryOrderLines("DRAFT"), true);
  assert.equal(canApproveFactoryOrder("DRAFT"), true);
  assert.equal(canAssignFactoryExternalCode("DRAFT"), false);
  assert.equal(canEditLineDueAt("DRAFT"), true);
});

test("approved factory order can receive 1C code and edit line dueAt", () => {
  assert.equal(canEditFactoryOrder("OPEN"), false);
  assert.equal(canEditFactoryOrderLines("OPEN"), false);
  assert.equal(canApproveFactoryOrder("OPEN"), false);
  assert.equal(canAssignFactoryExternalCode("OPEN"), true);
  assert.equal(canAssignFactoryExternalCode("PARTIAL"), true);
  assert.equal(canAssignFactoryExternalCode("CLOSED"), true);
  assert.equal(canEditLineDueAt("OPEN"), true);
  assert.equal(canEditLineDueAt("PARTIAL"), true);
  assert.equal(canEditLineDueAt("CLOSED"), false);
});

test("cancelled factory order is locked", () => {
  assert.equal(canEditFactoryOrder("CANCELLED"), false);
  assert.equal(canApproveFactoryOrder("CANCELLED"), false);
  assert.equal(canAssignFactoryExternalCode("CANCELLED"), false);
  assert.equal(canEditLineDueAt("CANCELLED"), false);
});
