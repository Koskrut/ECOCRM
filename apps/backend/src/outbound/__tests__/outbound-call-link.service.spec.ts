import { describe, it } from "node:test";
import assert from "node:assert";
import { OutboundCallLinkService } from "../outbound-call-link.service";
import type { PrismaService } from "../../prisma/prisma.service";

describe("OutboundCallLinkService", () => {
  it("updates attempt.callId when Call exists for provider+externalId", async () => {
    const updates: { where: { id: string }; data: { callId: string } }[] = [];
    const prisma = {
      outboundCallAttempt: {
        findUnique: async () => ({ callId: null }),
        update: async (args: { where: { id: string }; data: { callId: string } }) => {
          updates.push(args);
        },
      },
      call: {
        findUnique: async () => ({ id: "call-c1" }),
      },
    } as unknown as PrismaService;

    const svc = new OutboundCallLinkService(prisma);
    await svc.linkAttemptToCallIfPresent("att-1", "ringo-99", undefined);
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].data.callId, "call-c1");
  });

  it("no-op when externalCallId missing", async () => {
    let updateCalls = 0;
    const prisma = {
      outboundCallAttempt: { findUnique: async () => ({ callId: null }), update: async () => updateCalls++ },
      call: { findUnique: async () => ({ id: "x" }) },
    } as unknown as PrismaService;
    const svc = new OutboundCallLinkService(prisma);
    await svc.linkAttemptToCallIfPresent("att-1", "  ", undefined);
    assert.strictEqual(updateCalls, 0);
  });

  it("no-op when attempt already has callId", async () => {
    let callFinds = 0;
    const prisma = {
      outboundCallAttempt: {
        findUnique: async () => ({ callId: "existing" }),
        update: async () => assert.fail("should not update"),
      },
      call: {
        findUnique: async () => {
          callFinds += 1;
          return { id: "x" };
        },
      },
    } as unknown as PrismaService;
    const svc = new OutboundCallLinkService(prisma);
    await svc.linkAttemptToCallIfPresent("att-1", "ext", undefined);
    assert.strictEqual(callFinds, 0);
  });
});
