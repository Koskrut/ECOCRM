import test from "node:test";
import assert from "node:assert/strict";
import { InventorySnapshotStatus } from "@prisma/client";
import { InventorySnapshotService } from "../inventory-snapshot.service";

test("postSnapshot voids previous POSTED snapshots before promoting current", async () => {
  const calls: string[] = [];
  const tx = {
    inventorySnapshot: {
      updateMany: async () => {
        calls.push("updateMany");
        return { count: 2 };
      },
      update: async () => {
        calls.push("update");
        return {
          id: "s2",
          status: InventorySnapshotStatus.POSTED,
          lines: [],
        };
      },
    },
  };
  const prisma = {
    inventorySnapshot: {
      findUnique: async () => ({
        id: "s2",
        status: InventorySnapshotStatus.STAGED,
        lines: [],
      }),
    },
    $transaction: async <T>(cb: (inner: typeof tx) => Promise<T>): Promise<T> => cb(tx),
  };

  const service = new InventorySnapshotService(prisma as never);
  const posted = await service.postSnapshot("s2", "u1");

  assert.equal(posted.id, "s2");
  assert.equal(posted.status, InventorySnapshotStatus.POSTED);
  assert.deepEqual(calls, ["updateMany", "update"]);
});

