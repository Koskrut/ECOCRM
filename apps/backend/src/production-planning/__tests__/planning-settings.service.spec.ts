import test from "node:test";
import assert from "node:assert/strict";
import { PlanningDemandMix } from "@prisma/client";
import { PlanningSettingsService } from "../planning-settings.service";

test("PlanningSettingsService returns defaults when unset", async () => {
  const prisma = {
    systemSetting: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
  };
  const service = new PlanningSettingsService(prisma as never);
  const s = await service.getSettings();
  assert.equal(s.packCapacityPerCycle, 3500);
  assert.equal(s.factoryLeadTimeDays, 90);
  assert.equal(s.packCycleDays, 14);
  assert.equal(s.demandMix, PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED);
});

test("PlanningSettingsService clamps and persists updates", async () => {
  let stored: Record<string, unknown> | null = null;
  const prisma = {
    systemSetting: {
      findUnique: async () => (stored ? { value: stored } : { value: {} }),
      upsert: async ({ create, update }: { create: { value: Record<string, unknown> }; update: { value: Record<string, unknown> } }) => {
        stored = update?.value ?? create.value;
        return { value: stored };
      },
    },
  };
  const service = new PlanningSettingsService(prisma as never);
  const s = await service.setSettings({
    packCapacityPerCycle: 999999,
    safetyStockWeeks: 4,
    demandMix: PlanningDemandMix.MAX_FORECAST_HARD,
  });
  assert.equal(s.packCapacityPerCycle, 100_000);
  assert.equal(s.safetyStockWeeks, 4);
  assert.equal(s.demandMix, PlanningDemandMix.MAX_FORECAST_HARD);
});
