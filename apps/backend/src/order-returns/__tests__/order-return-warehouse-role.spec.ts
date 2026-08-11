import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  assertWarehouseReturnCreate,
  assertWarehouseReturnExternalCodeUpdate,
  assertWarehouseReturnSettlement,
  assertWarehouseReturnStatusUpdate,
} from "../order-return-warehouse-role";

describe("order-return-warehouse-role", () => {
  const warehouse = { id: "w1", role: "WAREHOUSE" as const };
  const manager = { id: "m1", role: "MANAGER" as const };

  it("blocks warehouse from creating returns", () => {
    assert.throws(
      () => assertWarehouseReturnCreate(warehouse),
      ForbiddenException,
    );
  });

  it("blocks warehouse from closing returns", () => {
    assert.throws(
      () => assertWarehouseReturnStatusUpdate(warehouse, "CLOSED"),
      ForbiddenException,
    );
  });

  it("allows warehouse to move to INSPECTION", () => {
    assert.doesNotThrow(() =>
      assertWarehouseReturnStatusUpdate(warehouse, "INSPECTION"),
    );
  });

  it("allows manager settlement actions", () => {
    assert.doesNotThrow(() => assertWarehouseReturnSettlement(manager));
  });

  it("blocks warehouse from editing 1C document number", () => {
    assert.throws(
      () => assertWarehouseReturnExternalCodeUpdate(warehouse),
      ForbiddenException,
    );
  });
});
