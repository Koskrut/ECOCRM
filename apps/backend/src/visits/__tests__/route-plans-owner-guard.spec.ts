import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";

import { RoutePlansService } from "../route-plans.service";
import type { AuthUser } from "../../auth/auth.types";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const VISIT_A1 = "visit-a1";
const VISIT_A2 = "visit-a2";
const VISIT_B1 = "visit-b1";

function actor(id: string): AuthUser {
  return { id, role: "MANAGER", email: `${id}@test.local` } as AuthUser;
}

function makePrisma(opts: {
  ownedVisitIds: string[];
  planId?: string;
  foreignStops?: { id: string; visitId: string }[];
}) {
  const planId = opts.planId ?? "plan-1";
  const foreignStops = opts.foreignStops ?? [];
  const ownedSet = new Set(opts.ownedVisitIds);

  return {
    visit: {
      findMany: async ({ where }: { where: { ownerId: string; id: { in: string[] } } }) => {
        assert.equal(where.ownerId, OWNER_A);
        return where.id.in.filter((id) => ownedSet.has(id)).map((id) => ({ id }));
      },
    },
    routePlan: {
      upsert: async () => ({ id: planId, ownerId: OWNER_A, date: new Date("2026-07-10T00:00:00.000Z") }),
      findUnique: async () => ({
        id: planId,
        ownerId: OWNER_A,
        date: new Date("2026-07-10T00:00:00.000Z"),
        stops: [],
      }),
    },
    routeStop: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: { data: { visitId: string }[] }) => {
        for (const row of data) {
          assert.ok(ownedSet.has(row.visitId), `must not create foreign stop ${row.visitId}`);
        }
        return { count: data.length };
      },
      findMany: async () => foreignStops,
    },
    routeSession: {
      updateMany: async () => ({ count: 0 }),
    },
  };
}

describe("RoutePlansService owner guard", () => {
  it("upsertForDay rejects foreign visitIds", async () => {
    const prisma = makePrisma({ ownedVisitIds: [VISIT_A1, VISIT_A2] });
    const svc = new RoutePlansService(prisma as never, {} as never);

    await assert.rejects(
      () => svc.upsertForDay("2026-07-10", [VISIT_A1, VISIT_B1], actor(OWNER_A)),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = (err as BadRequestException).getResponse() as { message?: string };
        assert.match(String(body.message ?? err), /do not belong/i);
        assert.match(String(body.message ?? err), new RegExp(VISIT_B1));
        return true;
      },
    );
  });

  it("upsertForDay accepts only own visits", async () => {
    const created: string[] = [];
    const prisma = makePrisma({ ownedVisitIds: [VISIT_A1, VISIT_A2] });
    prisma.routeStop.createMany = async ({ data }: { data: { visitId: string }[] }) => {
      created.push(...data.map((d) => d.visitId));
      return { count: data.length };
    };
    const svc = new RoutePlansService(prisma as never, {} as never);

    const result = await svc.upsertForDay(
      "2026-07-10",
      [VISIT_A1, VISIT_A2],
      actor(OWNER_A),
    );
    assert.ok(result);
    assert.deepEqual(created, [VISIT_A1, VISIT_A2]);
  });

  it("getForDay purges foreign RouteStops", async () => {
    const deletedIds: string[] = [];
    const planId = "plan-corrupt";
    const prisma = makePrisma({
      ownedVisitIds: [VISIT_A1],
      planId,
      foreignStops: [{ id: "stop-foreign", visitId: VISIT_B1 }],
    });
    prisma.routePlan.findUnique = async ({ where }: { where: { id?: string; ownerId_date?: unknown } }) => {
      if (where.id === planId) {
        return {
          id: planId,
          ownerId: OWNER_A,
          date: new Date("2026-07-10T00:00:00.000Z"),
          stops: [{ visitId: VISIT_A1, position: 1, visit: { id: VISIT_A1, ownerId: OWNER_A } }],
        };
      }
      return {
        id: planId,
        ownerId: OWNER_A,
        date: new Date("2026-07-10T00:00:00.000Z"),
        stops: [
          { visitId: VISIT_A1, position: 1, visit: { id: VISIT_A1, ownerId: OWNER_A } },
          { visitId: VISIT_B1, position: 2, visit: { id: VISIT_B1, ownerId: OWNER_B } },
        ],
      };
    };
    prisma.routeStop.deleteMany = async ({ where }: { where: { id: { in: string[] } } }) => {
      deletedIds.push(...where.id.in);
      return { count: where.id.in.length };
    };

    const svc = new RoutePlansService(prisma as never, {} as never);
    const plan = await svc.getForDay("2026-07-10", actor(OWNER_A));
    assert.ok(plan);
    assert.deepEqual(deletedIds, ["stop-foreign"]);
    assert.equal(plan.stops?.length, 1);
    assert.equal(plan.stops?.[0]?.visitId, VISIT_A1);
  });
});
