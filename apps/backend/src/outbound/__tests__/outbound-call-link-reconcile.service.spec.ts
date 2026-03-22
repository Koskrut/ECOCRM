import { describe, it } from "node:test";
import assert from "node:assert";
import { OutboundCallLinkReconcileService } from "../outbound-call-link-reconcile.service";
import type { PrismaService } from "../../prisma/prisma.service";

describe("OutboundCallLinkReconcileService", () => {
  it("links when exactly one Call candidate and updateMany applies", async () => {
    const updateManyArgs: unknown[] = [];
    const prisma = {
      outboundCallAttempt: {
        findMany: async () => [
          {
            id: "a1",
            phoneNormalized: "+380501111111",
            contactId: "c1",
            leadId: null as string | null,
            updatedAt: new Date("2026-01-15T12:00:00Z"),
          },
        ],
        findFirst: async () => null,
        updateMany: async (args: unknown) => {
          updateManyArgs.push(args);
          return { count: 1 };
        },
      },
      call: {
        findMany: async () => [{ id: "call-1" }],
      },
    } as unknown as PrismaService;

    const svc = new OutboundCallLinkReconcileService(prisma);
    const n = await svc.reconcileUnlinkedAttempts();
    assert.strictEqual(n, 1);
    assert.strictEqual(updateManyArgs.length, 1);
    const u = updateManyArgs[0] as { where: { id: string; callId: null }; data: { callId: string } };
    assert.strictEqual(u.where.id, "a1");
    assert.strictEqual(u.data.callId, "call-1");
  });

  it("skips when two Call candidates (ambiguous)", async () => {
    let updateManyCalls = 0;
    const prisma = {
      outboundCallAttempt: {
        findMany: async () => [
          {
            id: "a1",
            phoneNormalized: "+380501111111",
            contactId: null,
            leadId: null,
            updatedAt: new Date("2026-01-15T12:00:00Z"),
          },
        ],
        findFirst: async () => null,
        updateMany: async () => {
          updateManyCalls += 1;
          return { count: 1 };
        },
      },
      call: {
        findMany: async () => [{ id: "c1" }, { id: "c2" }],
      },
    } as unknown as PrismaService;

    const svc = new OutboundCallLinkReconcileService(prisma);
    const n = await svc.reconcileUnlinkedAttempts();
    assert.strictEqual(n, 0);
    assert.strictEqual(updateManyCalls, 0);
  });

  it("skips when Call already linked to another attempt", async () => {
    let updateManyCalls = 0;
    const prisma = {
      outboundCallAttempt: {
        findMany: async () => [
          {
            id: "a1",
            phoneNormalized: "+380501111111",
            contactId: null,
            leadId: null,
            updatedAt: new Date("2026-01-15T12:00:00Z"),
          },
        ],
        findFirst: async () => ({ id: "other-att" }),
        updateMany: async () => {
          updateManyCalls += 1;
          return { count: 1 };
        },
      },
      call: {
        findMany: async () => [{ id: "call-1" }],
      },
    } as unknown as PrismaService;

    const svc = new OutboundCallLinkReconcileService(prisma);
    const n = await svc.reconcileUnlinkedAttempts();
    assert.strictEqual(n, 0);
    assert.strictEqual(updateManyCalls, 0);
  });

  it("skips when updateMany count 0 (race / callId already set)", async () => {
    const prisma = {
      outboundCallAttempt: {
        findMany: async () => [
          {
            id: "a1",
            phoneNormalized: "+380501111111",
            contactId: null,
            leadId: null,
            updatedAt: new Date("2026-01-15T12:00:00Z"),
          },
        ],
        findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
      },
      call: {
        findMany: async () => [{ id: "call-1" }],
      },
    } as unknown as PrismaService;

    const svc = new OutboundCallLinkReconcileService(prisma);
    const n = await svc.reconcileUnlinkedAttempts();
    assert.strictEqual(n, 0);
  });
});
