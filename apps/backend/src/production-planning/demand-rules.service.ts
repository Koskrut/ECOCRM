import { Injectable } from "@nestjs/common";
import { OrderStage } from "@prisma/client";
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
}

