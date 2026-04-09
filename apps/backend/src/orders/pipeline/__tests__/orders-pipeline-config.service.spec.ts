import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderStage } from "@prisma/client";
import { DEFAULT_ALLOWED_TRANSITIONS } from "../order-pipeline.defaults";
import { buildDefaultPipelineRows } from "../order-pipeline.defaults";
import { OrdersPipelineConfigService } from "../orders-pipeline-config.service";

type PrismaSvc = import("../../../prisma/prisma.service").PrismaService;

describe("OrdersPipelineConfigService", () => {
  it("getEffectiveTransitionGraph falls back when table empty", async () => {
    const prisma = {
      orderPipelineStage: {
        findMany: async () => [],
      },
    } as unknown as PrismaSvc;

    const svc = new OrdersPipelineConfigService(prisma);
    const g = await svc.getEffectiveTransitionGraph();
    assert.deepEqual(g.NEW, DEFAULT_ALLOWED_TRANSITIONS.NEW);
  });

  it("getEffectiveTransitionGraph uses DB when complete and valid", async () => {
    const rows = buildDefaultPipelineRows().map((r) => ({
      stage: r.stage,
      sortOrder: r.sortOrder,
      label: r.label,
      color: r.color,
      kanbanGroup: r.kanbanGroup,
      allowedNext: r.stage === "NEW" ? (["CANCELED"] as OrderStage[]) : r.allowedNext,
    }));

    const prisma = {
      orderPipelineStage: {
        findMany: async () => rows,
      },
    } as unknown as PrismaSvc;

    const svc = new OrdersPipelineConfigService(prisma);
    const g = await svc.getEffectiveTransitionGraph();
    assert.deepEqual(g.NEW, ["CANCELED"]);
  });
});
