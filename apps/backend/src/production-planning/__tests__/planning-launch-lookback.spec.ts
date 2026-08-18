import test from "node:test";
import assert from "node:assert/strict";
import { OrderStage } from "@prisma/client";
import { PlanningCalculationService } from "../planning-calculation.service";

test("getLaunchRecommendations applies 90-day lookback on order createdAt", async () => {
  let createdAtFilter:
    | { gte?: Date; lte?: Date }
    | undefined;
  const prisma = {
    orderItem: {
      findMany: async ({ where }: { where: { order: { createdAt: { gte: Date; lte: Date } } } }) => {
        createdAtFilter = where.order.createdAt;
        return [];
      },
    },
    product: {
      findMany: async () => [],
    },
  };
  const demandRules = {
    getRules: async () => ({
      hardStages: [OrderStage.CONFIRMED],
      softStages: [OrderStage.NEW],
      includeOrderItemsWithoutProductIdAsSoft: true,
    }),
  };
  const service = new PlanningCalculationService(
    prisma as never,
    demandRules as never,
    {} as never,
    {} as never,
  );

  await service.getLaunchRecommendations(1);

  assert.ok(createdAtFilter?.gte instanceof Date);
  assert.ok(createdAtFilter?.lte instanceof Date);
  const diffDays = Math.round((createdAtFilter!.lte!.getTime() - createdAtFilter!.gte!.getTime()) / 86_400_000);
  // 90-day lookback + 1-week horizon window.
  assert.equal(diffDays, 97);
});

