import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { FieldShiftsService } from "../field-shifts.service";

function actor(role: UserRole, id = "u1"): AuthUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: "Test User",
    role,
  };
}

describe("FieldShiftsService.getSamples validation", () => {
  const prisma = {
    fieldShift: {
      findUnique: async () => null,
    },
    fieldLocationSample: {
      findMany: async () => [],
    },
  };

  const routePlans = {
    snapGpsPathToRoads: async () => ({ path: [], source: "none" as const, distanceKm: null }),
  };

  const eventEmitter = {
    emitAsync: async () => undefined,
  };

  const svc = new FieldShiftsService(prisma as never, routePlans as never, eventEmitter as never);

  it("throws when shift not found", async () => {
    await assert.rejects(
      () => svc.getSamples(actor(UserRole.MANAGER), "missing"),
      (err: Error & { status?: number }) => {
        assert.match(err.message, /not found/i);
        return true;
      },
    );
  });

  it("throws on invalid since", async () => {
    const prismaWithShift = {
      fieldShift: {
        findUnique: async () => ({ id: "s1", ownerId: "u1" }),
      },
      user: { findMany: async () => [] },
      fieldLocationSample: { findMany: async () => [] },
    };
    const local = new FieldShiftsService(prismaWithShift as never, routePlans as never, eventEmitter as never);
    await assert.rejects(
      () => local.getSamples(actor(UserRole.MANAGER), "s1", { since: "not-a-date" }),
      /Invalid since/,
    );
  });
});

describe("FieldShiftsService.getActive stale shifts", () => {
  it("closes stale active shifts for owner and returns null", async () => {
    const closed: string[] = [];
    const prisma = {
      fieldShift: {
        findMany: async () => [{ id: "s_old", ownerId: "u1" }],
        update: async ({ where }: { where: { id: string } }) => {
          closed.push(where.id);
          return { id: where.id, ownerId: "u1", date: new Date("2026-06-29T00:00:00.000Z") };
        },
        findFirst: async () => null,
      },
    };
    const routePlans = { snapGpsPathToRoads: async () => ({ path: [], source: "none" as const, distanceKm: null }) };
    const emitted: unknown[] = [];
    const eventEmitter = { emitAsync: async (_: string, payload: unknown) => emitted.push(payload) };

    const svc = new FieldShiftsService(prisma as never, routePlans as never, eventEmitter as never);
    const res = await svc.getActive(actor(UserRole.MANAGER, "u1"));

    assert.equal(res, null);
    assert.deepEqual(closed, ["s_old"]);
    assert.equal(emitted.length, 1);
  });
});
