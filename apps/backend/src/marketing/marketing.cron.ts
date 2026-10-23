import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ModuleIds } from "../modules/module-ids";
import { ModuleStateService } from "../modules/module-state.service";
import { MarketingAttributionService } from "./marketing-attribution.service";
import { MarketingConversionService } from "./marketing-conversion.service";
import { MarketingInsightsService } from "./marketing-insights.service";

@Injectable()
export class MarketingCron {
  private readonly logger = new Logger(MarketingCron.name);

  constructor(
    private readonly modules: ModuleStateService,
    private readonly insights: MarketingInsightsService,
    private readonly conversions: MarketingConversionService,
    private readonly attribution: MarketingAttributionService,
  ) {}

  @Cron("15 * * * *", { timeZone: "Europe/Kyiv" })
  async hourlyInsights() {
    if (process.env.MARKETING_CRON_DISABLED === "true") return;
    if (!(await this.modules.isEffective(ModuleIds.Marketing))) return;
    try {
      await this.attribution.backfill(200);
      await this.conversions.syncBackfill(200);
      await this.insights.syncRecent();
    } catch (error) {
      this.logger.error(`insights: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  @Cron("*/10 * * * *")
  async deliver() {
    if (process.env.MARKETING_CRON_DISABLED === "true") return;
    if (!(await this.modules.isEffective(ModuleIds.Marketing))) return;
    try {
      await this.conversions.scanPayments();
      await this.conversions.deliverDue();
    } catch (error) {
      this.logger.error(`outbox: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
