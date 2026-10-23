import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { SystemModule } from "../system/system.module";
import { MarketingAccountService } from "./marketing-account.service";
import { MarketingAiCallsService } from "./marketing-ai-calls.service";
import { MarketingAttributionService } from "./marketing-attribution.service";
import { MarketingAudienceService } from "./marketing-audience.service";
import { MarketingController } from "./marketing.controller";
import { MarketingConversionService } from "./marketing-conversion.service";
import { MarketingCron } from "./marketing.cron";
import { MarketingDashboardService } from "./marketing-dashboard.service";
import { MarketingInsightsService } from "./marketing-insights.service";
import { MarketingLinkService } from "./marketing-link.service";

@Module({
  imports: [PrismaModule, SettingsModule, SystemModule],
  controllers: [MarketingController],
  providers: [
    MarketingAccountService,
    MarketingAttributionService,
    MarketingInsightsService,
    MarketingConversionService,
    MarketingAudienceService,
    MarketingLinkService,
    MarketingDashboardService,
    MarketingAiCallsService,
    MarketingCron,
  ],
  exports: [MarketingAttributionService, MarketingConversionService],
})
export class MarketingModule {}
