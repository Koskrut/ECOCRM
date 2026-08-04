import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { resolveReturnWarehouseId } from "../return-warehouse.utils";

function mockDb(overrides: {
  warehouse?: { id: string } | null;
  order?: { warehouseId: string | null } | null;
}) {
  return {
    warehouse: {
      findUnique: async () => overrides.warehouse ?? null,
    },
    order: {
      findUnique: async () => overrides.order ?? null,
    },
  };
}

test("resolveReturnWarehouseId returns explicit warehouse when valid", async () => {
  const id = await resolveReturnWarehouseId(mockDb({ warehouse: { id: "wh-1" } }), {
    warehouseId: "wh-1",
  });
  assert.equal(id, "wh-1");
});

test("resolveReturnWarehouseId throws when warehouse not found", async () => {
  await assert.rejects(
    () =>
      resolveReturnWarehouseId(mockDb({ warehouse: null }), {
        warehouseId: "missing",
      }),
    BadRequestException,
  );
});

test("resolveReturnWarehouseId falls back to order warehouse", async () => {
  const id = await resolveReturnWarehouseId(
    mockDb({ order: { warehouseId: "wh-order" } }),
    { orderId: "ord-1" },
  );
  assert.equal(id, "wh-order");
});

test("resolveReturnWarehouseId returns null when nothing resolved", async () => {
  const id = await resolveReturnWarehouseId(mockDb({}), {});
  assert.equal(id, null);
});
