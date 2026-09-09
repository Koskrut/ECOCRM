import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { ContactsWorkQueueService } from "../contacts-work-queue.service";

function manager(): AuthUser {
  return { id: "mgr-1", email: "m@test.local", fullName: "Manager", role: UserRole.MANAGER };
}

function buildService(opts?: {
  findMany?: (args: { where?: unknown; select?: unknown; take?: number }) => Promise<unknown[]>;
  scoreReasons?: string[];
}) {
  const captured: { where?: unknown; take?: number; select?: unknown } = {};
  const prisma = {
    contact: {
      findMany: async (args: { where?: unknown; select?: unknown; take?: number }) => {
        captured.where = args.where;
        captured.take = args.take;
        captured.select = args.select;
        if (opts?.findMany) return opts.findMany(args);
        return [
          {
            id: "c1",
            firstName: "Ivan",
            lastName: "Petrov",
            phone: "+380501112233",
            email: "ivan@example.com",
            ownerId: "mgr-1",
            status: "Клієнт",
            clientStage: "ACTIVE_CLIENT",
            nextActionType: "CALL",
            nextActionAt: new Date("2026-09-10T10:00:00Z"),
            marketingCallOptOut: false,
            createdAt: new Date("2026-08-01T10:00:00Z"),
            owner: { fullName: "Manager" },
            company: { name: "Clinic A" },
          },
        ];
      },
    },
  };

  const insights = {
    buildExclusionSet: () => [],
    buildSignalsForContacts: async () =>
      new Map([
        [
          "c1",
          {
            daysSinceCreated: 10,
            daysSinceLastContact: 5,
            daysSinceLastOrder: 20,
            overdueFollowupTasks: 1,
            debtAmount: 12,
            lastContactAt: new Date("2026-09-01T10:00:00Z"),
            lastOrderAt: new Date("2026-08-20T10:00:00Z"),
          },
        ],
      ]),
  };

  const priority = {
    score: () => ({
      score: 80,
      reasons: opts?.scoreReasons ?? ["OVERDUE_FOLLOWUP", "HAS_DEBT"],
      breakdown: [],
    }),
    suggest: () => ({
      suggestedStage: "ACTIVE_CLIENT",
      suggestedNextActionType: "CALL",
    }),
  };

  const service = new ContactsWorkQueueService(
    prisma as never,
    insights as never,
    priority as never,
  );
  return { service, captured };
}

test("getWorkQueue returns email and uses expanded search fields", async () => {
  const { service, captured } = buildService();
  const result = await service.getWorkQueue({ q: "clinic", preset: "attention" }, manager());
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]!.contact.email, "ivan@example.com");

  const where = captured.where as { AND?: Array<Record<string, unknown>> };
  const searchOr = where.AND?.find(
    (part) => Array.isArray(part.OR) && JSON.stringify(part.OR).includes("email"),
  );
  assert.ok(searchOr, "expected expanded search OR clause");
  const serialized = JSON.stringify(searchOr.OR);
  assert.match(serialized, /company/);
  assert.match(serialized, /address/);
  assert.match(serialized, /city/);
});

test("getWorkQueueSummary scans full match set without take limit", async () => {
  const { service, captured } = buildService({
    findMany: async () =>
      Array.from({ length: 3 }, (_, i) => ({
        id: `c${i + 1}`,
        createdAt: new Date(),
        status: "Клієнт",
        marketingCallOptOut: false,
      })),
    scoreReasons: ["OVERDUE_FOLLOWUP"],
  });

  // Override insights/priority maps for 3 ids via fresh service helpers would be heavy;
  // instead assert take is undefined on the summary query path.
  await service.getWorkQueueSummary({}, manager());
  assert.equal(captured.take, undefined);
});

test("getWorkQueue reasons filter uses OR and intersects with preset", async () => {
  const { service } = buildService({
    scoreReasons: ["OVERDUE_FOLLOWUP", "HAS_DEBT"],
  });

  const orMatch = await service.getWorkQueue(
    { preset: "attention", reason: ["HAS_DEBT", "DORMANT"] },
    manager(),
  );
  assert.equal(orMatch.items.length, 1);

  const noOverlap = await service.getWorkQueue(
    { preset: "attention", reason: ["DORMANT", "AT_RISK"] },
    manager(),
  );
  assert.equal(noOverlap.items.length, 0);

  const presetBlocks = await service.getWorkQueue(
    { preset: "overdue", reason: ["HAS_DEBT"] },
    manager(),
  );
  // Contact has OVERDUE_FOLLOWUP so preset passes, and HAS_DEBT matches OR filter.
  assert.equal(presetBlocks.items.length, 1);

  const debtOnlyPresetMiss = await service.getWorkQueue(
    {
      preset: "new-no-first-contact",
      reason: ["HAS_DEBT"],
    },
    manager(),
  );
  assert.equal(debtOnlyPresetMiss.items.length, 0);
});
