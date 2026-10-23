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
      findMany: async () => [],
    },
    userNotification: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "n1",
        ...data,
        readAt: null,
        createdAt: new Date(),
      }),
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
      updateMany: async () => ({ count: 0 }),
    },
    systemSetting: {
      findUnique: async () => null,
      upsert: async ({ create }: { create: Record<string, unknown> }) => create,
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
        findMany: async () => [],
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { id: "n-existing", ...data };
        },
        updateMany: async () => ({ count: 0 }),
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

  it("creates notification when only telegram channel is enabled", async () => {
    let created = false;
    let delivered = false;
    const prisma = makePrisma({
      userNotificationPreference: {
        findUnique: async () => ({
          userId: "u1",
          type: "TELEGRAM_MESSAGE",
          inApp: false,
          browser: false,
          telegram: true,
        }),
      },
      userNotification: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = true;
          return { id: "n1", ...data, readAt: null, createdAt: new Date() };
        },
        findFirst: async () => null,
        count: async () => 0,
      },
    });
    const delivery = {
      afterCreate: async () => {
        delivered = true;
      },
    };
    const service = new NotificationsService(prisma, delivery as never);
    const result = await service.create({
      userId: "u1",
      type: "TELEGRAM_MESSAGE",
      title: "Telegram: Клієнт",
      body: "Привіт",
    });
    assert.ok(result);
    assert.equal(created, true);
    assert.equal(delivered, true);
  });

  it("creates notification when only mobile channel is enabled", async () => {
    let created = false;
    let delivered = false;
    const prisma = makePrisma({
      userNotificationPreference: {
        findUnique: async () => ({
          userId: "u1",
          type: "TASK_ASSIGNED",
          inApp: false,
          browser: false,
          telegram: false,
          mobile: true,
        }),
      },
      userNotification: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = true;
          return { id: "n1", ...data, readAt: null, createdAt: new Date() };
        },
        findFirst: async () => null,
        count: async () => 0,
      },
    });
    const delivery = {
      afterCreate: async () => {
        delivered = true;
      },
    };
    const service = new NotificationsService(prisma, delivery as never);
    const result = await service.create({
      userId: "u1",
      type: "TASK_ASSIGNED",
      title: "Нова задача",
    });
    assert.ok(result);
    assert.equal(created, true);
    assert.equal(delivered, true);
  });

  it("skips notification when all channels disabled", async () => {
    let created = false;
    const prisma = makePrisma({
      userNotificationPreference: {
        findUnique: async () => ({
          userId: "u1",
          type: "TASK_ASSIGNED",
          inApp: false,
          browser: false,
          telegram: false,
          mobile: false,
        }),
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
      userId: "u1",
      type: "TASK_ASSIGNED",
      title: "Test",
    });
    assert.equal(result, null);
    assert.equal(created, false);
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

  it("skips TASK_ASSIGNED when the task is already done", async () => {
    let created = false;
    const prisma = makePrisma({
      task: {
        findUnique: async () => ({ status: "DONE" }),
      },
      userNotification: {
        create: async () => {
          created = true;
          return { id: "n1" };
        },
      },
    });
    const service = new NotificationsService(prisma);
    await service.notifyTaskAssigned({
      assigneeId: "u2",
      taskId: "t1",
      title: "Нова задача",
    });
    assert.equal(created, false);
  });

  it("markReadForEntity closes unread notifications for a task", async () => {
    let updatedWhere: unknown;
    const prisma = makePrisma({
      userNotification: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "n1",
          ...data,
          readAt: null,
          createdAt: new Date(),
        }),
        findFirst: async () => null,
        count: async () => 0,
        updateMany: async ({ where }: { where: unknown }) => {
          updatedWhere = where;
          return { count: 2 };
        },
      },
    });
    const service = new NotificationsService(prisma);
    const count = await service.markReadForEntity("TASK", "t1");
    assert.equal(count, 2);
    assert.deepEqual(updatedWhere, { entityType: "TASK", entityId: "t1", readAt: null });
  });

  it("keeps original prevQty when debouncing the same item", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const existing = {
      id: "n-existing",
      meta: {
        debounceKey: "order:o1:qty_changed",
        prevTotalAmount: 1000,
        nextTotalAmount: 800,
        changes: [{ itemId: "i1", productName: "A", prevQty: 10, nextQty: 8 }],
      },
      readAt: null,
      createdAt: new Date(),
    };
    const prisma = makePrisma({
      userNotification: {
        findFirst: async () => existing,
        findMany: async () => [],
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { id: "n-existing", ...data };
        },
        updateMany: async () => ({ count: 0 }),
        create: async () => {
          throw new Error("should not create");
        },
      },
    });
    const service = new NotificationsService(prisma);
    await service.createDebouncedQtyChange({
      userId: "u1",
      orderId: "o1",
      orderNumber: "100",
      currency: "UAH",
      actorId: "wh1",
      change: { itemId: "i1", productName: "A", prevQty: 8, nextQty: 5 },
      prevTotalAmount: 800,
      nextTotalAmount: 500,
      debounceKey: "order:o1:qty_changed",
    });
    assert.equal(updates.length, 1);
    const meta = updates[0]?.meta as {
      changes: Array<{ prevQty: number; nextQty: number }>;
      prevTotalAmount: number;
      nextTotalAmount: number;
    };
    assert.equal(meta.changes[0]?.prevQty, 10);
    assert.equal(meta.changes[0]?.nextQty, 5);
    assert.equal(meta.prevTotalAmount, 1000);
    assert.equal(meta.nextTotalAmount, 500);
  });

  it("excludes inApp-disabled types from list and unread count", async () => {
    let listWhere: unknown;
    let countWhere: unknown;
    const prisma = makePrisma({
      userNotificationPreference: {
        findUnique: async () => null,
        findMany: async () => [{ type: "TASK_ASSIGNED" }],
      },
      userNotification: {
        findMany: async ({ where }: { where: unknown }) => {
          listWhere = where;
          return [];
        },
        count: async ({ where }: { where: unknown }) => {
          countWhere = where;
          return 0;
        },
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "n1",
          ...data,
          readAt: null,
          createdAt: new Date(),
        }),
      },
    });
    const service = new NotificationsService(prisma);
    await service.list("u1");
    await service.unreadCount("u1");
    assert.deepEqual((listWhere as { type: { notIn: string[] } }).type, {
      notIn: ["TASK_ASSIGNED"],
    });
    assert.deepEqual((countWhere as { type: { notIn: string[] } }).type, {
      notIn: ["TASK_ASSIGNED"],
    });
  });

  it("getPreferences returns defaults including mobile for field types", async () => {
    const prisma = makePrisma({
      userNotificationPreference: {
        findUnique: async () => null,
        findMany: async () => [],
      },
    });
    const service = new NotificationsService(prisma);
    const prefs = await service.getPreferences("u1");
    const field = prefs.types.find((t) => t.type === "FIELD_GPS_STALE");
    const sale = prefs.types.find((t) => t.type === "CLIENT_ORDER_ACCEPTED");
    const task = prefs.types.find((t) => t.type === "TASK_ASSIGNED");
    assert.equal(field?.mobile, true);
    assert.equal(sale?.mobile, true);
    assert.equal(task?.mobile, false);
    assert.equal(prefs.types.length > 10, true);
  });
});

