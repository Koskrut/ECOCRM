import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuditAccessService } from "../audit-access.service";
import type { TimelineAccessService } from "../../timeline/timeline-access.service";

describe("AuditAccessService", () => {
  const timelineAccess = {
    assertAccess: async (entityType: string, entityId: string) => {
      if (entityId === "missing") throw new NotFoundException("not found");
      if (entityId === "forbidden") throw new ForbiddenException("forbidden");
      void entityType;
    },
  } as TimelineAccessService;

  const service = new AuditAccessService(timelineAccess);

  it("rejects unsupported entity types", async () => {
    await assert.rejects(
      () => service.assertAccess("Payment", "x", { id: "u1", role: UserRole.ADMIN }),
      BadRequestException,
    );
  });

  it("delegates supported entity access to timeline service", async () => {
    await assert.doesNotReject(() =>
      service.assertAccess("Contact", "contact-1", { id: "u1", role: UserRole.MANAGER }),
    );
    await assert.rejects(
      () => service.assertAccess("Company", "missing", { id: "u1", role: UserRole.ADMIN }),
      NotFoundException,
    );
    await assert.rejects(
      () => service.assertAccess("Order", "forbidden", { id: "u1", role: UserRole.MANAGER }),
      ForbiddenException,
    );
  });
});
