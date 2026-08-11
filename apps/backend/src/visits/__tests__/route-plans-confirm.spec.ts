import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";

import { RoutePlansService } from "../route-plans.service";
import type { AuthUser } from "../../auth/auth.types";

const OWNER = "owner-a";
const VISIT_1 = "visit-1";
const VISIT_2 = "visit-2";
const DATE = "2026-08-11";

function actor(): AuthUser {
  return { id: OWNER, role: "MANAGER", email: "owner@test.local" } as AuthUser;
}

function visitRow(id: string) {
  return {
    id,
    ownerId: OWNER,
    lat: 46.48,
    lng: 30.73,
    title: id,
    contact: null,
    company: null,
  };
}

describe("RoutePlansService confirm / upsert reset", () => {
  it("upsertForDay clears confirmedAt when stop order changes", async () => {
    let updatePayload: { confirmedAt?: null } | undefined;
    const prisma = {
      visit: {
        findMany: async () => [visitRow(VISIT_1), visitRow(VISIT_2)],
      },
      routePlan: {
        findUnique: async ({ where }: { where: { id?: string; ownerId_date?: unknown } }) => {
          if (where.id === "plan-1") {
            return {
              id: "plan-1",
              ownerId: OWNER,
              confirmedAt: new Date("2026-08-11T08:00:00.000Z"),
              stops: [],
            };
          }
          return {
            id: "plan-1",
            ownerId: OWNER,
            confirmedAt: new Date("2026-08-11T08:00:00.000Z"),
            stops: [{ visitId: VISIT_1 }, { visitId: VISIT_2 }],
          };
        },
        upsert: async ({ update }: { update: { confirmedAt?: null } }) => {
          updatePayload = update;
          return { id: "plan-1", ownerId: OWNER, date: new Date(`${DATE}T00:00:00.000Z`) };
        },
      },
      routeStop: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async () => ({ count: 2 }),
        findMany: async () => [],
      },
      routeSession: {
        updateMany: async () => ({ count: 0 }),
      },
    };
    const svc = new RoutePlansService(prisma as never, {} as never);
    await svc.upsertForDay(DATE, [VISIT_2, VISIT_1], actor());
    assert.deepEqual(updatePayload, { confirmedAt: null });
  });

  it("upsertForDay keeps confirmation when order is unchanged", async () => {
    let updatePayload: Record<string, unknown> | undefined;
    const prisma = {
      visit: {
        findMany: async () => [visitRow(VISIT_1), visitRow(VISIT_2)],
      },
      routePlan: {
        findUnique: async ({ where }: { where: { id?: string } }) => {
          if (where.id === "plan-1") {
            return {
              id: "plan-1",
              ownerId: OWNER,
              confirmedAt: new Date("2026-08-11T08:00:00.000Z"),
              stops: [],
            };
          }
          return {
            id: "plan-1",
            ownerId: OWNER,
            confirmedAt: new Date("2026-08-11T08:00:00.000Z"),
            stops: [{ visitId: VISIT_1 }, { visitId: VISIT_2 }],
          };
        },
        upsert: async ({ update }: { update: Record<string, unknown> }) => {
          updatePayload = update;
          return { id: "plan-1", ownerId: OWNER, date: new Date(`${DATE}T00:00:00.000Z`) };
        },
      },
      routeStop: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async () => ({ count: 2 }),
        findMany: async () => [],
      },
      routeSession: {
        updateMany: async () => ({ count: 0 }),
      },
    };
    const svc = new RoutePlansService(prisma as never, {} as never);
    await svc.upsertForDay(DATE, [VISIT_1, VISIT_2], actor());
    assert.deepEqual(updatePayload, {});
  });

  it("confirmForDay rejects when OSRM is unavailable", async () => {
    const prisma = {
      visit: {
        findMany: async () => [visitRow(VISIT_1), visitRow(VISIT_2)],
      },
      routePlan: {
        findUnique: async () => ({
          id: "plan-1",
          ownerId: OWNER,
          confirmedAt: null,
          stops: [
            { visitId: VISIT_1, visit: visitRow(VISIT_1) },
            { visitId: VISIT_2, visit: visitRow(VISIT_2) },
          ],
        }),
      },
      routeStop: {
        findMany: async () => [],
      },
    };
    const svc = new RoutePlansService(prisma as never, {} as never);
    svc.getRouteGeometry = async () =>
      ({ source: "fallback", path: [], distanceKm: 1, durationMin: null }) as never;
    await assert.rejects(
      () => svc.confirmForDay(DATE, actor()),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = (err as BadRequestException).getResponse() as { message?: string };
        assert.match(String(body.message ?? err), /OSRM/i);
        return true;
      },
    );
  });

  it("confirmForDay sets confirmedAt when OSRM route exists", async () => {
    let saved: Date | null = null;
    const prisma = {
      visit: {
        findMany: async () => [visitRow(VISIT_1), visitRow(VISIT_2)],
      },
      routePlan: {
        findUnique: async () => ({
          id: "plan-1",
          ownerId: OWNER,
          confirmedAt: null,
          stops: [
            { visitId: VISIT_1, visit: visitRow(VISIT_1) },
            { visitId: VISIT_2, visit: visitRow(VISIT_2) },
          ],
        }),
        update: async ({ data }: { data: { confirmedAt: Date } }) => {
          saved = data.confirmedAt;
          return {
            id: "plan-1",
            ownerId: OWNER,
            confirmedAt: data.confirmedAt,
            stops: [],
          };
        },
      },
      routeStop: {
        findMany: async () => [],
      },
    };
    const svc = new RoutePlansService(prisma as never, {} as never);
    svc.getRouteGeometry = async () =>
      ({
        source: "osrm",
        path: [
          { lat: 46.48, lng: 30.73 },
          { lat: 46.49, lng: 30.74 },
        ],
        distanceKm: 4.2,
        durationMin: 12,
      }) as never;
    const plan = await svc.confirmForDay(DATE, actor());
    assert.ok(saved instanceof Date);
    assert.ok(plan.confirmedAt);
  });
});
