import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FieldShiftStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { FieldShiftsService } from "../field-shifts.service";

function actor(id = "owner-1"): AuthUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: "Owner",
    role: UserRole.MANAGER,
  };
}

describe("FieldShiftsService start reopen / appendSamples guards", () => {
  it("reopens a same-day shift ended within 60s instead of creating a new one", async () => {
    const ended = {
      id: "shift-1",
      ownerId: "owner-1",
      date: new Date("2026-09-16T00:00:00.000Z"),
      status: FieldShiftStatus.ENDED,
      endedAt: new Date(Date.now() - 5_000),
      plannedDistanceKm: 12,
      trackingEnabled: true,
      originKind: null,
      originLat: null,
      originLng: null,
      mobilityMode: "CAR",
      mobilityNote: null,
    };
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      fieldShift: {
        findFirst: async (args: { where: { status?: string } }) => {
          if (args.where.status === "ACTIVE") return null;
          if (args.where.status === "ENDED") return ended;
          return null;
        },
        findMany: async () => [],
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { ...ended, ...data, status: FieldShiftStatus.ACTIVE, endedAt: null };
        },
        create: async () => {
          throw new Error("should reopen, not create");
        },
      },
    };
    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const shift = await svc.start(actor(), {});
    assert.equal(shift.id, "shift-1");
    assert.equal(shift.status, FieldShiftStatus.ACTIVE);
    assert.equal(updates[0]?.endedAt, null);
  });

  it("soft-rejects invalid clientRecordedAt instead of 400 on the whole batch", async () => {
    const prisma = {
      fieldShift: {
        findFirst: async () => ({
          id: "shift-1",
          ownerId: "owner-1",
          status: FieldShiftStatus.ACTIVE,
          trackingEnabled: true,
          date: new Date("2026-08-10T00:00:00.000Z"),
        }),
      },
      fieldLocationSample: {
        findFirst: async () => null,
        findMany: async () => [],
        createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
      },
      userActivitySession: { findFirst: async () => null },
      fieldTrackingEvent: { create: async () => ({}) },
    };
    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const res = await svc.appendSamples(actor(), "shift-1", [
      {
        lat: 50.4501,
        lng: 30.5234,
        accuracyM: 15,
        clientRecordedAt: "not-a-date",
      },
      {
        lat: 50.4503,
        lng: 30.5236,
        accuracyM: 15,
        clientRecordedAt: "2026-08-10T09:00:00.000Z",
      },
    ]);
    assert.equal(res.created, 1);
    assert.equal(res.rejected, 1);
    assert.equal(res.rejectReasons.invalid_timestamp, 1);
  });

  it("accepts late flush on ENDED same-day shift within 15 minutes", async () => {
    const endedAt = new Date("2026-08-10T16:00:00.000Z");
    const prisma = {
      fieldShift: {
        findFirst: async () => ({
          id: "shift-1",
          ownerId: "owner-1",
          status: FieldShiftStatus.ENDED,
          trackingEnabled: true,
          date: new Date("2026-08-10T00:00:00.000Z"),
          endedAt,
        }),
      },
      fieldLocationSample: {
        findFirst: async () => null,
        findMany: async () => [],
        createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
      },
      userActivitySession: { findFirst: async () => null },
      fieldTrackingEvent: { create: async () => ({}) },
    };
    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const res = await svc.appendSamples(actor(), "shift-1", [
      {
        lat: 50.4501,
        lng: 30.5234,
        accuracyM: 15,
        clientRecordedAt: "2026-08-10T16:10:00.000Z",
      },
    ]);
    assert.equal(res.created, 1);
    assert.equal(res.shiftClosed, false);
  });
});
