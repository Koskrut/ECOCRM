import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrdersPipelineConfigService } from "../../orders/pipeline/orders-pipeline-config.service";
import { LeadsPipelineConfigService } from "../../leads/pipeline/leads-pipeline-config.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;

describe("pipeline history read", () => {
  it("orders history uses ORDER_PIPELINE filter and newest-first sorting", async () => {
    const prisma = {
      pipelineConfigHistory: {
        findMany: async (args: unknown) => {
          const a = args as { where: { entityType: string }; orderBy: { createdAt: string } };
          assert.equal(a.where.entityType, "ORDER_PIPELINE");
          assert.equal(a.orderBy.createdAt, "desc");
          return [{ id: "h1" }];
        },
        count: async (args: unknown) => {
          const a = args as { where: { entityType: string } };
          assert.equal(a.where.entityType, "ORDER_PIPELINE");
          return 1;
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrdersPipelineConfigService(prisma);
    const out = await svc.getHistory({ page: 1, pageSize: 20 });
    assert.equal(out.total, 1);
    assert.equal(out.items.length, 1);
  });

  it("leads history uses LEAD_PIPELINE filter and newest-first sorting", async () => {
    const prisma = {
      pipelineConfigHistory: {
        findMany: async (args: unknown) => {
          const a = args as { where: { entityType: string }; orderBy: { createdAt: string } };
          assert.equal(a.where.entityType, "LEAD_PIPELINE");
          assert.equal(a.orderBy.createdAt, "desc");
          return [{ id: "h1" }];
        },
        count: async (args: unknown) => {
          const a = args as { where: { entityType: string } };
          assert.equal(a.where.entityType, "LEAD_PIPELINE");
          return 1;
        },
      },
    } as unknown as PrismaSvc;

    const svc = new LeadsPipelineConfigService(prisma);
    const out = await svc.getHistory({ page: 1, pageSize: 20 });
    assert.equal(out.total, 1);
    assert.equal(out.items.length, 1);
  });
});
