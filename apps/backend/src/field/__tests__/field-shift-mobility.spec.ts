import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FuelCompensationStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { parseMobilityMode } from "../field-shift-anchors.util";
import { FieldShiftsService } from "../field-shifts.service";

function actor(role: UserRole, id = "u1"): AuthUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: "Test",
    role,
  };
}

describe("parseMobilityMode", () => {
  it("parses CAR and WALK_TRANSIT", () => {
    assert.equal(parseMobilityMode("CAR"), "CAR");
    assert.equal(parseMobilityMode("WALK_TRANSIT"), "WALK_TRANSIT");
    assert.equal(parseMobilityMode("bike"), null);
    assert.equal(parseMobilityMode(null), null);
  });
});

describe("FieldShiftsService.start mobility", () => {
  it("persists WALK_TRANSIT + note on create", async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      fieldShift: {
        findFirst: async () => null,
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "s1", ...data };
        },
      },
      user: {
        findUnique: async () => ({
          routeStartLat: 50.45,
          routeStartLng: 30.52,
          routeEndLat: null,
          routeEndLng: null,
        }),
      },
    };
    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const shift = await svc.start(actor(UserRole.MANAGER), {
      originKind: "HOME",
      originLat: 50.45,
      originLng: 30.52,
      mobilityMode: "WALK_TRANSIT",
      mobilityNote: "авто на СТО",
    });
    assert.equal(created.length, 1);
    assert.equal(created[0]!.mobilityMode, "WALK_TRANSIT");
    assert.equal(created[0]!.mobilityNote, "авто на СТО");
    assert.equal((shift as { mobilityMode: string }).mobilityMode, "WALK_TRANSIT");
  });

  it("idempotent ACTIVE reuse does not overwrite mobility", async () => {
    const updates: Record<string, unknown>[] = [];
    const existing = {
      id: "s-existing",
      ownerId: "u1",
      status: "ACTIVE",
      plannedDistanceKm: 12,
      trackingEnabled: true,
      mobilityMode: "WALK_TRANSIT",
      mobilityNote: "СТО",
      date: new Date("2026-08-31T00:00:00.000Z"),
    };
    const prisma = {
      fieldShift: {
        findFirst: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { ...existing, ...data };
        },
      },
    };
    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    await svc.start(actor(UserRole.MANAGER), {
      mobilityMode: "CAR",
      mobilityNote: "should not apply",
      plannedDistanceKm: 20,
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]!.mobilityMode, undefined);
    assert.equal(updates[0]!.mobilityNote, undefined);
    assert.equal(updates[0]!.plannedDistanceKm, 20);
  });
});

describe("FieldShiftsService.patchMobility", () => {
  const baseShift = {
    id: "shift-1",
    ownerId: "mgr-1",
    date: new Date("2026-08-31T00:00:00.000Z"),
    mobilityMode: "CAR",
    mobilityNote: null as string | null,
  };

  it("rejects MANAGER", async () => {
    const svc = new FieldShiftsService(
      { fieldShift: { findUnique: async () => baseShift } } as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    await assert.rejects(
      () => svc.patchMobility(actor(UserRole.MANAGER), "shift-1", { mobilityMode: "WALK_TRANSIT" }),
      /lead or admin/i,
    );
  });

  it("LEAD of team member can set WALK_TRANSIT", async () => {
    const prisma = {
      fieldShift: {
        findUnique: async () => baseShift,
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...baseShift,
          ...data,
        }),
      },
      fuelDayReport: {
        findFirst: async () => null,
      },
      user: {
        findMany: async () => [{ id: "mgr-1" }],
      },
    };
    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const lead = actor(UserRole.LEAD, "lead-1");
    const res = await svc.patchMobility(lead, "shift-1", {
      mobilityMode: "WALK_TRANSIT",
      mobilityNote: "СТО",
    });
    assert.equal(res.shift.mobilityMode, "WALK_TRANSIT");
    assert.equal(res.ownerId, "mgr-1");
    assert.ok(res.dateStr);
  });

  it("rejects when fuel report is PAID", async () => {
    const prisma = {
      fieldShift: {
        findUnique: async () => baseShift,
      },
      fuelDayReport: {
        findFirst: async () => ({ id: "r1", compensationStatus: FuelCompensationStatus.PAID }),
      },
      user: {
        findMany: async () => [{ id: "mgr-1" }],
      },
    };
    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    await assert.rejects(
      () =>
        svc.patchMobility(actor(UserRole.ADMIN), "shift-1", { mobilityMode: "WALK_TRANSIT" }),
      /paid/i,
    );
  });
});

/** Pure guard mirrored in FieldFuelRefuelsService.create */
function canAddRefuelOnMobility(mode: "CAR" | "WALK_TRANSIT" | null | undefined): boolean {
  return mode !== "WALK_TRANSIT";
}

describe("refuel deny on WALK_TRANSIT", () => {
  it("blocks refuels on walk/transit days", () => {
    assert.equal(canAddRefuelOnMobility("CAR"), true);
    assert.equal(canAddRefuelOnMobility(null), true);
    assert.equal(canAddRefuelOnMobility("WALK_TRANSIT"), false);
  });
});
