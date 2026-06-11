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

  const svc = new FieldShiftsService(prisma as never);

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
    const local = new FieldShiftsService(prismaWithShift as never);
    await assert.rejects(
      () => local.getSamples(actor(UserRole.MANAGER), "s1", { since: "not-a-date" }),
      /Invalid since/,
    );
  });
});
