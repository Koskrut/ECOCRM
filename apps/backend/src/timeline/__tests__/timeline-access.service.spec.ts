import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { TimelineAccessService } from "../timeline-access.service";

const manager = { id: "m1", role: UserRole.MANAGER, email: "m1@crm.test", fullName: "m1" };

test("contact access: manager can read unassigned", async () => {
  const service = new TimelineAccessService({
    contact: { findUnique: async () => ({ ownerId: null }) },
    lead: { findUnique: async () => ({ ownerId: null }) },
    company: { findUnique: async () => ({ ownerId: null }) },
    order: { findUnique: async () => ({ ownerId: null }) },
  } as never);
  await assert.doesNotReject(() => service.assertAccess("contact", "ct-1", manager));
});

test("order access: manager denied when foreign owner", async () => {
  const service = new TimelineAccessService({
    contact: { findUnique: async () => ({ ownerId: null }) },
    lead: { findUnique: async () => ({ ownerId: null }) },
    company: { findUnique: async () => ({ ownerId: null }) },
    order: { findUnique: async () => ({ ownerId: "owner-2" }) },
  } as never);
  await assert.rejects(() => service.assertAccess("order", "ord-1", manager), ForbiddenException);
});
