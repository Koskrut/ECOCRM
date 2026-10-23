import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { MarketingAccountService } from "./marketing-account.service";
import { MarketingAiCallsService } from "./marketing-ai-calls.service";
import { MarketingAudienceService } from "./marketing-audience.service";
import { MarketingDashboardService } from "./marketing-dashboard.service";
import {
  AiCallsDto,
  CreateMarketingLinkDto,
  MarketingFlagsDto,
  MarketingQueryDto,
  SpendFileDto,
  SyncAudienceDto,
  UpsertMarketingAccountDto,
} from "./marketing.dto";
import { MarketingInsightsService } from "./marketing-insights.service";
import { MarketingLinkService } from "./marketing-link.service";

@Controller("marketing")
@RequireModule(ModuleIds.Marketing)
@Roles(UserRole.ADMIN, UserRole.LEAD)
export class MarketingController {
  constructor(
    private readonly dashboard: MarketingDashboardService,
    private readonly accounts: MarketingAccountService,
    private readonly insights: MarketingInsightsService,
    private readonly audiences: MarketingAudienceService,
    private readonly links: MarketingLinkService,
    private readonly aiCalls: MarketingAiCallsService,
  ) {}

  @Get("health")
  health() {
    return { ok: true, module: ModuleIds.Marketing };
  }

  @Get("overview")
  overview(@Query() query: MarketingQueryDto) {
    return this.dashboard.overview(query);
  }

  @Get("campaigns")
  campaigns(@Query() query: MarketingQueryDto) {
    return this.dashboard.campaigns(query);
  }

  @Get("campaigns/:platform/:externalId")
  campaign(
    @Param("platform") platform: string,
    @Param("externalId") externalId: string,
    @Query() query: MarketingQueryDto,
  ) {
    return this.dashboard.campaign(platform, externalId, query);
  }

  @Get("audiences")
  listAudiences() {
    return this.audiences.list();
  }

  @Post("audiences/:id/sync")
  syncAudience(@Param("id") id: string, @Body() body: SyncAudienceDto) {
    return this.audiences.sync(id, body);
  }

  @Post("audiences/:id/lookalike")
  lookalike(@Param("id") id: string) {
    return this.audiences.lookalike(id);
  }

  @Get("links")
  linksList() {
    return this.links.list();
  }

  @Get("links/campaigns")
  linkCampaigns() {
    return this.links.campaignChoices();
  }

  @Post("links")
  createLink(@Body() body: CreateMarketingLinkDto) {
    return this.links.create(body);
  }

  @Delete("links/:id")
  removeLink(@Param("id") id: string) {
    return this.links.remove(id);
  }

  @Get("accounts")
  async accountsList() {
    const [items, flags, aiEnabled] = await Promise.all([
      this.accounts.list(),
      this.accounts.flags(),
      this.aiCalls.enabled(),
    ]);
    return { items, ...flags, aiCallsEnabled: aiEnabled };
  }

  @Put("accounts")
  saveAccount(@Body() body: UpsertMarketingAccountDto) {
    return this.accounts.upsert(body);
  }

  @Put("settings")
  saveSettings(@Body() body: MarketingFlagsDto) {
    return this.accounts.saveFlags(body);
  }

  @Post("google/spend-file")
  spendFile(@Body() body: SpendFileDto) {
    return this.insights.importGoogleFile(body.csv, body.currency);
  }

  @Get("ai-calls/campaigns")
  aiCampaigns() {
    return this.aiCalls.campaigns();
  }

  @Post("ai-calls/preview")
  aiPreview(@Body() body: AiCallsDto) {
    return this.aiCalls.preview(body);
  }

  @Post("ai-calls/enqueue")
  aiEnqueue(@Body() body: AiCallsDto) {
    return this.aiCalls.enqueue(body);
  }
}
