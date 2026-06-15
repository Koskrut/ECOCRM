import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotificationsService } from "../notifications.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;

function makePrisma(overrides: Partial<Record<string, unknown>> = {}): PrismaSvc {
  return {
    user: {
      findUnique: async () => ({ id: "u1", isActive: true, leadId: null, lead: null }),
    },
    userNotificationPreference: {
      findUnique: async () => null,
    },
    userNotification: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "n1",
        ...data,
        readAt: null,
        createdAt: new Date(),
      }),
      findFirst: async () => null,
      count: async () => 0,
    },
    ...overrides,
  } as unknown as PrismaSvc;
}

describe("NotificationsService", () => {
  it("skips notification when actor is recipient", async () => {
    let created = false;
    const prisma = makePrisma({
      userNotification: {
        create: async () => {
          created = true;
          return { id: "n1" };
        },
      },
    });
    const service = new NotificationsService(prisma);
    const result = await service.create({
      userId: "u1",
      type: "ORDER_QTY_CHANGED",
      title: "Test",
      actorId: "u1",
    });
    assert.equal(result, null);
    assert.equal(created, false);
  });

  it("skips notification for inactive recipient", async () => {
    let created = false;
    const prisma = makePrisma({
      user: {
        findUnique: async () => ({ id: "u2", isActive: false }),
      },
      userNotification: {
        create: async () => {
          created = true;
          return { id: "n1" };
        },
      },
    });
    const service = new NotificationsService(prisma);
    const result = await service.create({
      userId: "u2",
      type: "ORDER_SPLIT",
      title: "Test",
      actorId: "wh1",
    });
    assert.equal(result, null);
    assert.equal(created, false);
  });

  it("merges debounced qty changes into one notification", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const existing = {
      id: "n-existing",
      meta: {
        debounceKey: "order:o1:qty_changed",
        changes: [{ itemId: "i1", productName: "A", prevQty: 10, nextQty: 8 }],
      },
      readAt: null,
      createdAt: new Date(),
    };

    const prisma = makePrisma({
      userNotification: {
        findFirst: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { id: "n-existing", ...data };
        },
        create: async () => {
          throw new Error("should not create");
        },
      },
    });

    const service = new NotificationsService(prisma);
    const row = await service.createDebouncedQtyChange({
      userId: "u1",
      orderId: "o1",
      orderNumber: "100",
      currency: "UAH",
      actorId: "wh1",
      change: { itemId: "i2", productName: "B", prevQty: 5, nextQty: 3 },
      prevTotalAmount: 1000,
      nextTotalAmount: 800,
      debounceKey: "order:o1:qty_changed",
    });

    assert.ok(row);
    assert.equal(updates.length, 1);
    const meta = updates[0]?.meta as { changes?: unknown[] };
    assert.equal(meta?.changes?.length, 2);
  });

  it("markRead scopes to user", async () => {
    const prisma = makePrisma({
      userNotification: {
        findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
          where.id === "n1" && where.userId === "u1"
            ? { id: "n1", userId: "u1", readAt: null }
            : null,
        update: async ({ where, data }: { where: { id: string }; data: { readAt: Date } }) => ({
          id: where.id,
          readAt: data.readAt,
        }),
      },
    });
    const service = new NotificationsService(prisma);
    const row = await service.markRead("u1", "n1");
    assert.ok(row.readAt);
  });
});
