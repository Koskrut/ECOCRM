import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const CAPACITY_KEY = "planning_capacity_v1";
const HORIZON_KEY = "planning_horizon_v1";

export type PlanningCapacityConfig = {
  monthlyPartsQuota: number;
};

export type PlanningHorizonConfig = {
  coverMonths: number;
  velocityLookbackMonths: number;
  warnCoverDays: number;
  criticalCoverDays: number;
  softPipelineFactor: number;
  defaultPackLeadDays: number;
};

export const DEFAULT_CAPACITY: PlanningCapacityConfig = {
  monthlyPartsQuota: 7000,
};

export const DEFAULT_HORIZON: PlanningHorizonConfig = {
  coverMonths: 3,
  velocityLookbackMonths: 6,
  warnCoverDays: 60,
  criticalCoverDays: 30,
  softPipelineFactor: 0.5,
  defaultPackLeadDays: 14,
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

@Injectable()
export class MrpConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getCapacity(): Promise<PlanningCapacityConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { id: CAPACITY_KEY } });
    if (!row?.value || typeof row.value !== "object") return { ...DEFAULT_CAPACITY };
    const value = row.value as Partial<PlanningCapacityConfig>;
    return {
      monthlyPartsQuota: clampInt(
        value.monthlyPartsQuota,
        DEFAULT_CAPACITY.monthlyPartsQuota,
        1,
        1_000_000,
      ),
    };
  }

  async setCapacity(next: Partial<PlanningCapacityConfig>): Promise<PlanningCapacityConfig> {
    const current = await this.getCapacity();
    const merged: PlanningCapacityConfig = {
      monthlyPartsQuota: clampInt(
        next.monthlyPartsQuota ?? current.monthlyPartsQuota,
        current.monthlyPartsQuota,
        1,
        1_000_000,
      ),
    };
    await this.prisma.systemSetting.upsert({
      where: { id: CAPACITY_KEY },
      create: { id: CAPACITY_KEY, value: merged },
      update: { value: merged },
    });
    return this.getCapacity();
  }

  async getHorizon(): Promise<PlanningHorizonConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { id: HORIZON_KEY } });
    if (!row?.value || typeof row.value !== "object") return { ...DEFAULT_HORIZON };
    const value = row.value as Partial<PlanningHorizonConfig>;
    return {
      coverMonths: clampInt(value.coverMonths, DEFAULT_HORIZON.coverMonths, 1, 24),
      velocityLookbackMonths: clampInt(
        value.velocityLookbackMonths,
        DEFAULT_HORIZON.velocityLookbackMonths,
        1,
        36,
      ),
      warnCoverDays: clampInt(value.warnCoverDays, DEFAULT_HORIZON.warnCoverDays, 1, 365),
      criticalCoverDays: clampInt(
        value.criticalCoverDays,
        DEFAULT_HORIZON.criticalCoverDays,
        1,
        365,
      ),
      softPipelineFactor: clampFloat(
        value.softPipelineFactor,
        DEFAULT_HORIZON.softPipelineFactor,
        0,
        2,
      ),
      defaultPackLeadDays: clampInt(
        value.defaultPackLeadDays,
        DEFAULT_HORIZON.defaultPackLeadDays,
        0,
        90,
      ),
    };
  }

  async setHorizon(next: Partial<PlanningHorizonConfig>): Promise<PlanningHorizonConfig> {
    const current = await this.getHorizon();
    const merged: PlanningHorizonConfig = {
      coverMonths: clampInt(next.coverMonths ?? current.coverMonths, current.coverMonths, 1, 24),
      velocityLookbackMonths: clampInt(
        next.velocityLookbackMonths ?? current.velocityLookbackMonths,
        current.velocityLookbackMonths,
        1,
        36,
      ),
      warnCoverDays: clampInt(
        next.warnCoverDays ?? current.warnCoverDays,
        current.warnCoverDays,
        1,
        365,
      ),
      criticalCoverDays: clampInt(
        next.criticalCoverDays ?? current.criticalCoverDays,
        current.criticalCoverDays,
        1,
        365,
      ),
      softPipelineFactor: clampFloat(
        next.softPipelineFactor ?? current.softPipelineFactor,
        current.softPipelineFactor,
        0,
        2,
      ),
      defaultPackLeadDays: clampInt(
        next.defaultPackLeadDays ?? current.defaultPackLeadDays,
        current.defaultPackLeadDays,
        0,
        90,
      ),
    };
    await this.prisma.systemSetting.upsert({
      where: { id: HORIZON_KEY },
      create: { id: HORIZON_KEY, value: merged },
      update: { value: merged },
    });
    return this.getHorizon();
  }
}
