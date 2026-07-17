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
    assert.deepEqual(created[0], {
      shiftId: "shift-1",
      lat: 50.45,
      lng: 30.52,
      accuracyM: 12,
      clientRecordedAt: new Date("2026-07-16T12:00:00.000Z"),
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

  it("skips when filter rejects duplicate near last sample", async () => {
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
        create: async () => {
          throw new Error("should not create");
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
  });
});
