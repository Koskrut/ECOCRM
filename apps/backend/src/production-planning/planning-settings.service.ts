import { Injectable } from "@nestjs/common";
import { PlanningDemandMix } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const SETTING_KEY = "planning_settings_v1";

export type PlanningSettings = {
  packCycleDays: number;
  packCapacityPerCycle: number;
  factoryLeadTimeDays: number;
  safetyStockWeeks: number;
  snapshotMaxAgeDays: number;
  salesMinCoverageMonths: number;
  demandMix: PlanningDemandMix;
};

export const DEFAULT_PLANNING_SETTINGS: PlanningSettings = {
  packCycleDays: 14,
  packCapacityPerCycle: 3500,
  factoryLeadTimeDays: 90,
  safetyStockWeeks: 3,
  snapshotMaxAgeDays: 7,
  salesMinCoverageMonths: 6,
  demandMix: PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED,
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

@Injectable()
export class PlanningSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<PlanningSettings> {
    const row = await this.prisma.systemSetting.findUnique({ where: { id: SETTING_KEY } });
    if (!row?.value || typeof row.value !== "object") return { ...DEFAULT_PLANNING_SETTINGS };
    const value = row.value as Partial<PlanningSettings>;
    const demandMix =
      value.demandMix === PlanningDemandMix.MAX_FORECAST_HARD
        ? PlanningDemandMix.MAX_FORECAST_HARD
        : PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED;
    return {
      packCycleDays: clampInt(value.packCycleDays, DEFAULT_PLANNING_SETTINGS.packCycleDays, 7, 60),
      packCapacityPerCycle: clampInt(
        value.packCapacityPerCycle,
        DEFAULT_PLANNING_SETTINGS.packCapacityPerCycle,
        1,
        100_000,
      ),
      factoryLeadTimeDays: clampInt(
        value.factoryLeadTimeDays,
        DEFAULT_PLANNING_SETTINGS.factoryLeadTimeDays,
        1,
        365,
      ),
      safetyStockWeeks: clampInt(
        value.safetyStockWeeks,
        DEFAULT_PLANNING_SETTINGS.safetyStockWeeks,
        0,
        26,
      ),
      snapshotMaxAgeDays: clampInt(
        value.snapshotMaxAgeDays,
        DEFAULT_PLANNING_SETTINGS.snapshotMaxAgeDays,
        1,
        90,
      ),
      salesMinCoverageMonths: clampInt(
        value.salesMinCoverageMonths,
        DEFAULT_PLANNING_SETTINGS.salesMinCoverageMonths,
        1,
        18,
      ),
      demandMix,
    };
  }

  async setSettings(next: Partial<PlanningSettings>): Promise<PlanningSettings> {
    const current = await this.getSettings();
    const merged: PlanningSettings = {
      packCycleDays: clampInt(
        next.packCycleDays ?? current.packCycleDays,
        current.packCycleDays,
        7,
        60,
      ),
      packCapacityPerCycle: clampInt(
        next.packCapacityPerCycle ?? current.packCapacityPerCycle,
        current.packCapacityPerCycle,
        1,
        100_000,
      ),
      factoryLeadTimeDays: clampInt(
        next.factoryLeadTimeDays ?? current.factoryLeadTimeDays,
        current.factoryLeadTimeDays,
        1,
        365,
      ),
      safetyStockWeeks: clampInt(
        next.safetyStockWeeks ?? current.safetyStockWeeks,
        current.safetyStockWeeks,
        0,
        26,
      ),
      snapshotMaxAgeDays: clampInt(
        next.snapshotMaxAgeDays ?? current.snapshotMaxAgeDays,
        current.snapshotMaxAgeDays,
        1,
        90,
      ),
      salesMinCoverageMonths: clampInt(
        next.salesMinCoverageMonths ?? current.salesMinCoverageMonths,
        current.salesMinCoverageMonths,
        1,
        18,
      ),
      demandMix:
        next.demandMix === PlanningDemandMix.MAX_FORECAST_HARD
          ? PlanningDemandMix.MAX_FORECAST_HARD
          : next.demandMix === PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED
            ? PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED
            : current.demandMix,
    };
    await this.prisma.systemSetting.upsert({
      where: { id: SETTING_KEY },
      create: { id: SETTING_KEY, value: merged },
      update: { value: merged },
    });
    return this.getSettings();
  }
}
