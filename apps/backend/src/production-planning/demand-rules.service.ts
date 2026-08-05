import { Injectable } from "@nestjs/common";
import { OrderStage, ReservationHardness, ReservationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const SETTING_KEY = "planning_demand_rules_v1";

export type DemandRules = {
  hardStages: OrderStage[];
  softStages: OrderStage[];
  includeOrderItemsWithoutProductIdAsSoft: boolean;
};

const DEFAULT_RULES: DemandRules = {
  hardStages: [OrderStage.CONFIRMED, OrderStage.AWAITING_STOCK, OrderStage.READY_TO_SHIP],
  softStages: [OrderStage.NEW, OrderStage.AWAITING_PAYMENT],
  includeOrderItemsWithoutProductIdAsSoft: true,
};

@Injectable()
export class DemandRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getRules(): Promise<DemandRules> {
    const row = await this.prisma.systemSetting.findUnique({ where: { id: SETTING_KEY } });
    if (!row || !row.value) return DEFAULT_RULES;
    const value = row.value as Partial<DemandRules>;
    return {
      hardStages: Array.isArray(value.hardStages) ? value.hardStages : DEFAULT_RULES.hardStages,
      softStages: Array.isArray(value.softStages) ? value.softStages : DEFAULT_RULES.softStages,
      includeOrderItemsWithoutProductIdAsSoft:
        value.includeOrderItemsWithoutProductIdAsSoft ??
        DEFAULT_RULES.includeOrderItemsWithoutProductIdAsSoft,
    };
  }

  async setRules(next: DemandRules): Promise<DemandRules> {
    await this.prisma.systemSetting.upsert({
      where: { id: SETTING_KEY },
      create: { id: SETTING_KEY, value: next },
      update: { value: next },
    });
    return this.getRules();
  }

  /** Align ACTIVE reservation hardness with current softStages after rule changes. */
  async resyncReservationHardness(): Promise<{ updated: number }> {
    const rules = await this.getRules();
    const softSet = new Set(rules.softStages);
    const active = await this.prisma.materialReservation.findMany({
      where: { status: ReservationStatus.ACTIVE, orderId: { not: null } },
      select: {
        id: true,
        hardness: true,
        order: { select: { orderStage: true } },
      },
    });

    let updated = 0;
    for (const row of active) {
      const stage = row.order?.orderStage ?? OrderStage.NEW;
      const expected = softSet.has(stage) ? ReservationHardness.SOFT : ReservationHardness.HARD;
      if (row.hardness !== expected) {
        await this.prisma.materialReservation.update({
          where: { id: row.id },
          data: { hardness: expected },
        });
        updated += 1;
      }
    }
    return { updated };
  }
}

