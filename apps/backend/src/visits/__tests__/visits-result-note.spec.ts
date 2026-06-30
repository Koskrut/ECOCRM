import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { UserRole, VisitStatus } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { VisitsService } from "../visits.service";

function actor(id = "u1"): AuthUser {
  return { id, email: `${id}@test.local`, fullName: "Test", role: UserRole.MANAGER };
}

function createService(overrides?: {
  existing?: Record<string, unknown>;
  activityUpdate?: (args: unknown) => Promise<unknown>;
}) {
  const existing = {
    id: "v1",
    ownerId: "u1",
    status: VisitStatus.DONE,
    outcome: "SUCCESS",
    resultNote: "Old note",
    completedAt: new Date("2026-06-20T12:00:00.000Z"),
    contactId: "c1",
    companyId: null,
    activityId: "act-1",
    startsAt: new Date("2026-06-20T10:00:00.000Z"),
    endsAt: new Date("2026-06-20T11:00:00.000Z"),
    lat: 50.45,
    lng: 30.52,
    ...overrides?.existing,
  };

  const updateData: unknown[] = [];
  const activityUpdates: unknown[] = [];

  const prisma = {
    visit: {
      findUnique: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData.push(data);
        return { ...existing, ...data };
      },
    },
    activity: {
      update: async (args: unknown) => {
        activityUpdates.push(args);
        return overrides?.activityUpdate ? overrides.activityUpdate(args) : {};
      },
    },
  };

  const activitiesService = {};
  const eventEmitter = { emitAsync: async () => undefined };
  const contactsService = {};
  const settings = {};

  const service = new VisitsService(
    prisma as never,
    activitiesService as never,
    eventEmitter as never,
    contactsService as never,
    settings as never,
  );

  return { service, updateData, activityUpdates, existing };
}

test("update: allows resultNote on DONE visit and syncs activity", async () => {
  const { service, updateData, activityUpdates } = createService();

  const updated = await service.update("v1", { resultNote: "  Updated note  " }, actor());

  assert.equal(updated.resultNote, "Updated note");
  assert.equal((updateData[0] as { resultNote: string }).resultNote, "Updated note");
  assert.equal(activityUpdates.length, 1);
  const actUpdate = activityUpdates[0] as {
    where: { id: string };
    data: { body: string; title: string };
  };
  assert.equal(actUpdate.where.id, "act-1");
  assert.equal(actUpdate.data.body, "Updated note");
  assert.match(actUpdate.data.title, /SUCCESS/);
});

test("update: rejects empty resultNote on DONE visit", async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.update("v1", { resultNote: "   " }, actor()),
    (err: BadRequestException) => {
      assert.equal(err.message, "resultNote is required");
      return true;
    },
  );
});

test("update: rejects resultNote on non-DONE visit", async () => {
  const { service } = createService({
    existing: { status: VisitStatus.SCHEDULED },
  });
  await assert.rejects(
    () => service.update("v1", { resultNote: "New note" }, actor()),
    (err: BadRequestException) => {
      assert.equal(err.message, "resultNote can only be updated on completed visits");
      return true;
    },
  );
});
