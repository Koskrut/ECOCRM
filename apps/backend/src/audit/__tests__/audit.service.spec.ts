import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuditService } from "../audit.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;

describe("AuditService", () => {
  it("builds update payload with diff and redaction", () => {
    const prisma = {} as PrismaSvc;
    const service = new AuditService(prisma);
    const payload = service.buildUpdatePayload({
      entityType: "Order",
      entityId: "o1",
      changedBy: "u1",
      before: { status: "NEW", token: "x" },
      after: { status: "SHIPPED", token: "y" },
      context: { path: "/orders/o1" },
    });

    assert.equal(payload.entityType, "Order");
    assert.equal(payload.entityId, "o1");
    assert.equal(payload.action, "UPDATE");
    assert.ok(Array.isArray(payload.diff));
    assert.equal((payload.before as Record<string, unknown>).token, "<redacted>");
    assert.equal((payload.after as Record<string, unknown>).token, "<redacted>");
  });
});
