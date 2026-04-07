import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../../../prisma/prisma.service";
import { RingostatReconcileService } from "../ringostat-reconcile.service";

describe("RingostatReconcileService", () => {
  it("dry-run reports fixable without updating rows", async () => {
    let updates = 0;
    const prisma = {
      call: {
        findMany: async () => [
          {
            id: "c1",
            from: "+380441112233",
            to: "+380441112233",
            fromNormalized: "+380441112233",
            toNormalized: "+380441112233",
            managerUserId: null,
            rawPayload: { type: "out", callee: "380931112233", outbound_number: "380441112233" },
          },
        ],
        update: async () => {
          updates += 1;
          return null;
        },
      },
    } as unknown as PrismaService;
    const ingest = {
      recomputeLegsFromRaw: async () => ({
        direction: "OUTBOUND" as const,
        from: "380931112233",
        to: "380441112233",
        fromNormalized: "+380931112233",
        toNormalized: "+380441112233",
        managerUserId: "u1",
      }),
    };
    const svc = new RingostatReconcileService(prisma, ingest as never);

    const report = await svc.reconcile({ dryRun: true, limit: 10 });
    assert.equal(report.scanned, 1);
    assert.equal(report.fixable, 1);
    assert.equal(report.updated, 0);
    assert.equal(updates, 0);
  });

  it("apply mode updates fixable rows", async () => {
    let updates = 0;
    const prisma = {
      call: {
        findMany: async () => [
          {
            id: "c1",
            from: "+380441112233",
            to: "+380441112233",
            fromNormalized: "+380441112233",
            toNormalized: "+380441112233",
            managerUserId: null,
            rawPayload: { type: "out", callee: "380931112233", outbound_number: "380441112233" },
          },
        ],
        update: async () => {
          updates += 1;
          return null;
        },
      },
    } as unknown as PrismaService;
    const ingest = {
      recomputeLegsFromRaw: async () => ({
        direction: "OUTBOUND" as const,
        from: "380931112233",
        to: "380441112233",
        fromNormalized: "+380931112233",
        toNormalized: "+380441112233",
        managerUserId: "u1",
      }),
    };
    const svc = new RingostatReconcileService(prisma, ingest as never);

    const report = await svc.reconcile({ dryRun: false, limit: 10 });
    assert.equal(report.scanned, 1);
    assert.equal(report.fixable, 1);
    assert.equal(report.updated, 1);
    assert.equal(updates, 1);
  });
});

