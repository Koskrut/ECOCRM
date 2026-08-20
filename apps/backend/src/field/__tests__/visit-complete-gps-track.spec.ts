import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FieldShiftStatus } from "@prisma/client";

import { dualWriteCompleteGpsToActiveShift } from "../../visits/visit-complete-gps-track";

describe("dualWriteCompleteGpsToActiveShift", () => {
  it("creates a sample when an ACTIVE tracking shift exists", async () => {
    const created: unknown[] = [];
    const prisma = {
      fieldShift: {
        findFirst: async () => ({ id: "shift-1" }),
      },
      fieldLocationSample: {
        findFirst: async () => null,
        create: async (args: { data: unknown }) => {
          created.push(args.data);
          return args.data;
        },
      },
    };

    const result = await dualWriteCompleteGpsToActiveShift(prisma, {
      ownerId: "owner-1",
      lat: 50.45,
      lng: 30.52,
      accuracyM: 12,
      clientRecordedAt: new Date("2026-07-16T12:00:00.000Z"),
    });

    assert.equal(result.created, true);
    assert.equal(created.length, 1);
    assert.match(String((created[0] as { sampleId?: string }).sampleId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(created[0], {
      shiftId: "shift-1",
      ownerId: "owner-1",
      sampleId: (created[0] as { sampleId: string }).sampleId,
      lat: 50.45,
      lng: 30.52,
      accuracyM: 12,
      clientRecordedAt: new Date("2026-07-16T12:00:00.000Z"),
      source: "EXPO",
    });
  });

  it("skips when no ACTIVE tracking shift", async () => {
    const prisma = {
      fieldShift: {
        findFirst: async (args: { where: { status?: string; trackingEnabled?: boolean } }) => {
          assert.equal(args.where.status, FieldShiftStatus.ACTIVE);
          assert.equal(args.where.trackingEnabled, true);
          return null;
        },
      },
      fieldLocationSample: {
        findFirst: async () => null,
        create: async () => {
          throw new Error("should not create");
        },
      },
    };

    const result = await dualWriteCompleteGpsToActiveShift(prisma, {
      ownerId: "owner-1",
      lat: 50.45,
      lng: 30.52,
      clientRecordedAt: new Date(),
    });
    assert.equal(result.created, false);
    assert.equal(result.reason, "no_active_tracking_shift");
  });

  it("skips near-duplicate sample to mirror ingest filter", async () => {
    const created: unknown[] = [];
    const prisma = {
      fieldShift: {
        findFirst: async () => ({ id: "shift-1" }),
      },
      fieldLocationSample: {
        findFirst: async () => ({
          lat: 50.45,
          lng: 30.52,
          accuracyM: 10,
          clientRecordedAt: new Date("2026-07-16T11:59:00.000Z"),
        }),
        create: async (args: { data: unknown }) => {
          created.push(args.data);
          return args.data;
        },
      },
    };

    const result = await dualWriteCompleteGpsToActiveShift(prisma, {
      ownerId: "owner-1",
      lat: 50.45001,
      lng: 30.52001,
      accuracyM: 10,
      clientRecordedAt: new Date("2026-07-16T12:00:00.000Z"),
    });
    assert.equal(result.created, false);
    assert.equal(result.reason, "duplicate");
    assert.equal(created.length, 0);
  });

  it("skips when accuracy is too poor", async () => {
    const prisma = {
      fieldShift: {
        findFirst: async () => ({ id: "shift-1" }),
      },
      fieldLocationSample: {
        findFirst: async () => null,
        create: async () => {
          throw new Error("should not create");
        },
      },
    };

    const result = await dualWriteCompleteGpsToActiveShift(prisma, {
      ownerId: "owner-1",
      lat: 50.45,
      lng: 30.52,
      accuracyM: 200,
      clientRecordedAt: new Date("2026-07-16T12:00:00.000Z"),
    });
    assert.equal(result.created, false);
    assert.equal(result.reason, "bad_accuracy");
  });

  it("looks up ACTIVE shift by visit Kyiv day (dayRef), not wall-clock today", async () => {
    let seenDate: Date | undefined;
    const prisma = {
      fieldShift: {
        findFirst: async (args: { where: { date?: Date } }) => {
          seenDate = args.where.date;
          return { id: "shift-past" };
        },
      },
      fieldLocationSample: {
        findFirst: async () => null,
        create: async (args: { data: unknown }) => args.data,
      },
    };

    const dayRef = new Date("2026-07-16T10:00:00.000Z");
    const result = await dualWriteCompleteGpsToActiveShift(prisma, {
      ownerId: "owner-1",
      lat: 50.45,
      lng: 30.52,
      clientRecordedAt: new Date("2026-07-16T22:30:00.000Z"),
      dayRef,
    });
    assert.equal(result.created, true);
    assert.ok(seenDate);
    assert.equal(seenDate!.toISOString().slice(0, 10), "2026-07-16");
  });
});
