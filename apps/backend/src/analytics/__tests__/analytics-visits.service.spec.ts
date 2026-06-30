import assert from "node:assert/strict";
import test from "node:test";
import { AnalyticsVisitsService } from "../services/analytics-visits.service";

test("AnalyticsVisitsService filters by startsAt or completedAt when startsAt is null", async () => {
  const period = {
    from: new Date("2026-06-01T00:00:00.000Z"),
    to: new Date("2026-06-30T23:59:59.999Z"),
  };
  const scope = { orderScope: { actor: { id: "a1", role: "ADMIN" } as never } };

  const visitQueries: unknown[] = [];

  const prisma = {
    visit: {
      count: async (args: unknown) => {
        visitQueries.push(args);
        return 3;
      },
      groupBy: async (args: unknown) => {
        visitQueries.push(args);
        const by = (args as { by?: string[] }).by;
        if (by?.includes("status")) {
          return [{ status: "DONE", _count: { id: 3 } }];
        }
        return [{ ownerId: "u1", _count: { id: 3 } }];
      },
    },
    user: {
      findMany: async () => [{ id: "u1", fullName: "Manager One" }],
    },
  };

  const service = new AnalyticsVisitsService(prisma as never);
  const result = await service.getVisits(period, scope);

  assert.equal(result.total, 3);
  assert.equal(visitQueries.length >= 1, true);

  const countQuery = visitQueries[0] as {
    where?: { OR?: Array<Record<string, unknown>> };
  };
  const orClause = countQuery.where?.OR;
  assert.ok(Array.isArray(orClause));
  assert.ok(orClause!.some((c) => "startsAt" in c));
  assert.ok(orClause!.some((c) => "completedAt" in c));

  const serialized = JSON.stringify(visitQueries);
  assert.equal(serialized.includes("scheduledAt"), false);
});
