import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { FieldShiftsService } from "../field-shifts.service";
import { sanitizeGpsTrack } from "../gps-sample-filter";

function actor(role: UserRole, id = "u1"): AuthUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: "Test User",
    role,
  };
}

describe("FieldShiftsService.getTrackGeometry", () => {
  it("loads all samples without read cap and returns snapped geometry", async () => {
    const samples = Array.from({ length: 600 }, (_, i) => ({
      id: `s${i}`,
      lat: 50.45 + i * 0.0002,
      lng: 30.52 + i * 0.0002,
      accuracyM: 20,
      clientRecordedAt: new Date(Date.parse("2026-06-25T08:00:00.000Z") + i * 60_000),
      createdAt: new Date(),
    }));

    const prisma = {
      fieldShift: {
        findUnique: async () => ({ id: "shift1", ownerId: "u1" }),
      },
      user: { findMany: async () => [] },
      fieldLocationSample: {
        findMany: async () => samples,
      },
    };

    const snappedPath = [
      { lat: 50.45, lng: 30.52 },
      { lat: 50.51, lng: 30.58 },
    ];
    const routePlans = {
      snapGpsPathToRoads: async () => ({
        path: snappedPath,
        source: "osrm" as const,
        distanceKm: 12.3,
      }),
    };
    const eventEmitter = { emitAsync: async () => undefined };

    const svc = new FieldShiftsService(prisma as never, routePlans as never, eventEmitter as never);
    const result = await svc.getTrackGeometry(actor(UserRole.MANAGER), "shift1");

    const filtered = sanitizeGpsTrack(
      samples.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        accuracyM: s.accuracyM,
        clientRecordedAt: s.clientRecordedAt,
      })),
    );

    assert.equal(result.sampleCount, filtered.filteredSampleCount);
    assert.ok(result.sampleCount > 500);
    assert.equal(result.path.length, 2);
    assert.equal(result.source, "osrm");
    assert.equal(result.distanceKm, 12.3);
    assert.equal(result.paths?.length, 1);
  });

  it("snaps reanchored segments separately so Kyiv and Odessa stay disjoint", async () => {
    const kyiv = Array.from({ length: 4 }, (_, i) => ({
      id: `k${i}`,
      lat: 50.45 + i * 0.0003,
      lng: 30.52 + i * 0.0003,
      accuracyM: 20,
      clientRecordedAt: new Date(Date.parse("2026-06-25T08:00:00.000Z") + i * 60_000),
      createdAt: new Date(),
    }));
    const odessa = Array.from({ length: 4 }, (_, i) => ({
      id: `o${i}`,
      lat: 46.4825 + i * 0.0003,
      lng: 30.7233 + i * 0.0003,
      accuracyM: 20,
      clientRecordedAt: new Date(Date.parse("2026-06-25T08:10:00.000Z") + i * 60_000),
      createdAt: new Date(),
    }));
    const samples = [...kyiv, ...odessa];

    const prisma = {
      fieldShift: {
        findUnique: async () => ({ id: "shift1", ownerId: "u1" }),
      },
      user: { findMany: async () => [] },
      fieldLocationSample: {
        findMany: async () => samples,
      },
    };

    const snapCalls: number[] = [];
    const routePlans = {
      snapGpsPathToRoads: async (pts: Array<{ lat: number }>) => {
        snapCalls.push(pts.length);
        return {
          path: pts.map((p) => ({ lat: p.lat, lng: (p as { lng: number }).lng })),
          source: "osrm" as const,
          distanceKm: 1.2,
        };
      },
    };
    const eventEmitter = { emitAsync: async () => undefined };

    const svc = new FieldShiftsService(prisma as never, routePlans as never, eventEmitter as never);
    const result = await svc.getTrackGeometry(actor(UserRole.MANAGER), "shift1");

    assert.equal(snapCalls.length, 2);
    assert.equal(result.paths?.length, 2);
    assert.ok(result.paths![0]!.every((p) => p.lat > 50));
    assert.ok(result.paths![1]!.every((p) => p.lat < 47));
    assert.equal(result.distanceKm, 2.4);
    assert.equal(result.source, "osrm");
  });

  it("throws when shift not found", async () => {
    const prisma = {
      fieldShift: { findUnique: async () => null },
    };
    const routePlans = {
      snapGpsPathToRoads: async () => ({ path: [], source: "none" as const, distanceKm: null }),
    };
    const eventEmitter = { emitAsync: async () => undefined };
    const svc = new FieldShiftsService(prisma as never, routePlans as never, eventEmitter as never);

    await assert.rejects(
      () => svc.getTrackGeometry(actor(UserRole.MANAGER), "missing"),
      /not found/i,
    );
  });
});
