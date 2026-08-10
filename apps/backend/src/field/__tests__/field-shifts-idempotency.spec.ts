import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
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

const shiftRow = {
  id: "shift-1",
  ownerId: "owner-1",
  status: "ACTIVE" as const,
  trackingEnabled: true,
  date: new Date("2026-08-10T00:00:00.000Z"),
};

const uaSample = {
  lat: 50.4501,
  lng: 30.5234,
  accuracyM: 15,
  clientRecordedAt: "2026-08-10T09:00:00.000Z",
};

describe("FieldShiftsService.appendSamples idempotency", () => {
  it("returns duplicate for same sampleId in one request", async () => {
    const createdRows: unknown[] = [];
    const prisma = {
      fieldShift: {
        findFirst: async () => shiftRow,
      },
      fieldLocationSample: {
        findFirst: async () => null,
        findMany: async () => [],
        createMany: async ({ data }: { data: unknown[] }) => {
          createdRows.push(...data);
          return { count: data.length };
        },
      },
      userActivitySession: {
        findFirst: async () => ({ id: "sess-1" }),
        update: async () => ({}),
      },
    };

    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const sampleId = "11111111-1111-4111-8111-111111111111";
    const res = await svc.appendSamples(actor(), "shift-1", [
      { ...uaSample, sampleId, deviceId: "dev-1", source: "native_android" },
      { ...uaSample, lat: 50.451, sampleId, deviceId: "dev-1", source: "native_android" },
    ]);

    assert.equal(res.created, 1);
    assert.equal(res.duplicate, 1);
    assert.equal(createdRows.length, 1);
  });

  it("returns duplicate when sampleId already stored (retry after lost response)", async () => {
    const sampleId = "22222222-2222-4222-8222-222222222222";
    let createCalls = 0;
    const prisma = {
      fieldShift: {
        findFirst: async () => shiftRow,
      },
      fieldLocationSample: {
        findFirst: async () => null,
        findMany: async () => [{ sampleId }],
        createMany: async () => {
          createCalls += 1;
          return { count: 0 };
        },
      },
      userActivitySession: {
        findFirst: async () => null,
      },
    };

    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const res = await svc.appendSamples(actor(), "shift-1", [
      { ...uaSample, sampleId, deviceId: "dev-1" },
    ]);

    assert.equal(res.created, 0);
    assert.equal(res.duplicate, 1);
    assert.equal(createCalls, 0);
  });

  it("allows two sampleIds at same coordinates", async () => {
    const inserted: Array<{ sampleId?: string | null }> = [];
    const prisma = {
      fieldShift: {
        findFirst: async () => shiftRow,
      },
      fieldLocationSample: {
        findFirst: async () => null,
        findMany: async () => [],
        createMany: async ({ data }: { data: Array<{ sampleId?: string | null }> }) => {
          inserted.push(...data);
          return { count: data.length };
        },
      },
      userActivitySession: {
        findFirst: async () => null,
      },
    };

    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const res = await svc.appendSamples(actor(), "shift-1", [
      { ...uaSample, sampleId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1" },
      {
        ...uaSample,
        lat: 50.451,
        sampleId: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        clientRecordedAt: "2026-08-10T09:01:00.000Z",
      },
    ]);

    assert.equal(res.created, 2);
    assert.equal(res.duplicate, 0);
    assert.equal(inserted.length, 2);
  });

  it("scopes duplicate lookup to shift owner (tenant isolation)", async () => {
    const lookups: Array<{ ownerId?: string }> = [];
    const prisma = {
      fieldShift: {
        findFirst: async () => ({ ...shiftRow, ownerId: "owner-A" }),
      },
      fieldLocationSample: {
        findFirst: async () => null,
        findMany: async (args: { where: { ownerId: string } }) => {
          lookups.push(args.where);
          return [];
        },
        createMany: async () => ({ count: 1 }),
      },
      userActivitySession: {
        findFirst: async () => null,
      },
    };

    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    await svc.appendSamples(actor("owner-A"), "shift-1", [
      { ...uaSample, sampleId: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1" },
    ]);

    assert.equal(lookups[0]?.ownerId, "owner-A");
  });

  it("does not refresh lastServerAcceptAt on ghost duplicate from another shift", async () => {
    const sampleId = "33333333-3333-4333-8333-333333333333";
    const sessionUpdates: Array<Record<string, unknown>> = [];
    let findFirstCalls = 0;
    const prisma = {
      fieldShift: {
        findFirst: async () => shiftRow,
      },
      fieldLocationSample: {
        findFirst: async (args: { where: { shiftId?: string; sampleId?: unknown } }) => {
          findFirstCalls += 1;
          if (findFirstCalls === 1) return null;
          if (args.where.shiftId && args.where.sampleId) return null;
          return null;
        },
        findMany: async () => [{ sampleId, ownerId: "owner-1", deviceId: "dev-1" }],
        createMany: async () => {
          throw new Error("should not insert ghost duplicates");
        },
      },
      userActivitySession: {
        findFirst: async () => ({ id: "sess-1" }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          sessionUpdates.push(data);
          return {};
        },
      },
    };

    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const res = await svc.appendSamples(
      actor(),
      "shift-1",
      [{ ...uaSample, sampleId, deviceId: "dev-1" }],
      {
        appLastSeenAt: "2026-08-10T10:00:00.000Z",
        lastGpsCapturedAt: "2026-08-10T09:55:00.000Z",
      },
    );

    assert.equal(res.created, 0);
    assert.equal(res.duplicate, 1);
    assert.equal(sessionUpdates.length, 1);
    assert.equal(sessionUpdates[0]?.lastServerAcceptAt, undefined);
    assert.ok(sessionUpdates[0]?.appLastSeenAt);
    assert.ok(sessionUpdates[0]?.lastGpsCapturedAt);
  });

  it("refreshes lastServerAcceptAt when duplicate exists on current shift", async () => {
    const sampleId = "44444444-4444-4444-8444-444444444444";
    const sessionUpdates: Array<Record<string, unknown>> = [];
    let findFirstCalls = 0;
    const prisma = {
      fieldShift: {
        findFirst: async () => shiftRow,
      },
      fieldLocationSample: {
        findFirst: async (args: { where: { shiftId?: string; sampleId?: unknown } }) => {
          findFirstCalls += 1;
          if (findFirstCalls === 1) return null;
          if (args.where.shiftId && args.where.sampleId) return { id: "on-shift-row" };
          return null;
        },
        findMany: async () => [{ sampleId, ownerId: "owner-1", deviceId: "dev-1" }],
        createMany: async () => ({ count: 0 }),
      },
      userActivitySession: {
        findFirst: async () => ({ id: "sess-1" }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          sessionUpdates.push(data);
          return {};
        },
      },
    };

    const svc = new FieldShiftsService(
      prisma as never,
      {} as never,
      { emitAsync: async () => undefined } as never,
    );
    const res = await svc.appendSamples(actor(), "shift-1", [
      { ...uaSample, sampleId, deviceId: "dev-1" },
    ]);

    assert.equal(res.created, 0);
    assert.equal(res.duplicate, 1);
    assert.equal(sessionUpdates.length, 1);
    assert.ok(sessionUpdates[0]?.lastServerAcceptAt);
  });
});
