import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsScopeService } from "./analytics-scope.service";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsAttentionService } from "./services/analytics-attention.service";
import { AnalyticsClientsService } from "./services/analytics-clients.service";
import { AnalyticsDrilldownService } from "./services/analytics-drilldown.service";
import { AnalyticsFinanceService } from "./services/analytics-finance.service";
import { AnalyticsLeadsService } from "./services/analytics-leads.service";
import { AnalyticsManagersService } from "./services/analytics-managers.service";
import { AnalyticsOverviewService } from "./services/analytics-overview.service";
import { AnalyticsOperationsService } from "./services/analytics-operations.service";
import { AnalyticsProductsService } from "./services/analytics-products.service";
import { AnalyticsSalesService } from "./services/analytics-sales.service";
import { AnalyticsVisitsService } from "./services/analytics-visits.service";

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsScopeService,
    AnalyticsOverviewService,
    AnalyticsOperationsService,
    AnalyticsSalesService,
    AnalyticsLeadsService,
    AnalyticsAttentionService,
    AnalyticsManagersService,
    AnalyticsFinanceService,
    AnalyticsClientsService,
    AnalyticsProductsService,
    AnalyticsVisitsService,
    AnalyticsDrilldownService,
  ],
})
export class AnalyticsModule {}
