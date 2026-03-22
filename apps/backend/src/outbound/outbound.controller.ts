import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { CreateOutboundCampaignDto } from "./dto/create-outbound-campaign.dto";
import { EnqueueDormantDto } from "./dto/enqueue-dormant.dto";
import { EnqueueLeadsDto } from "./dto/enqueue-leads.dto";
import { PatchCampaignActiveDto } from "./dto/patch-campaign-active.dto";
import { ReviewAttemptDto } from "./dto/review-attempt.dto";
import { OutboundCampaignService } from "./outbound-campaign.service";
import { ScenarioRegistryService } from "./scenarios/scenario-registry.service";

@Controller("outbound")
@Roles(UserRole.ADMIN)
export class OutboundController {
  constructor(
    private readonly campaigns: OutboundCampaignService,
    private readonly scenarios: ScenarioRegistryService,
  ) {}

  @Get("scenarios")
  listScenarios() {
    return this.scenarios.list().map((s) => ({
      code: s.code,
      version: s.version,
      name: s.name,
      nameUk: s.nameUk,
      targetSegment: s.targetSegment,
      outcomeMappings: s.outcomeMappings.map((m) => ({
        outcomeKey: m.outcomeKey,
        description: m.description,
        bucket: m.crm.bucket,
      })),
    }));
  }

  @Post("campaigns")
  createCampaign(@Body() body: CreateOutboundCampaignDto) {
    return this.campaigns.createCampaign(body);
  }

  @Get("campaigns")
  listCampaigns() {
    return this.campaigns.listCampaignsWithStats();
  }

  @Patch("campaigns/:id/active")
  setActive(@Param("id") id: string, @Body() body: PatchCampaignActiveDto) {
    return this.campaigns.setCampaignActive(id, body.isActive);
  }

  @Post("campaigns/:id/enqueue-leads")
  enqueueLeads(@Param("id") id: string, @Body() body: EnqueueLeadsDto) {
    return this.campaigns.enqueueLeads(id, body.leadIds);
  }

  @Post("campaigns/:id/enqueue-dormant")
  enqueueDormant(@Param("id") id: string, @Body() body: EnqueueDormantDto) {
    return this.campaigns.enqueueDormant(id, body);
  }

  @Get("attempts")
  listAttempts(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("campaignId") campaignId?: string,
    @Query("status") status?: string,
    @Query("scenarioCode") scenarioCode?: string,
    @Query("needsReview") needsReview?: string,
    @Query("callLinked") callLinked?: string,
  ) {
    return this.campaigns.listAttempts({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      campaignId,
      status,
      scenarioCode,
      needsReview: needsReview === "true" ? true : needsReview === "false" ? false : undefined,
      callLinked: callLinked === "true" ? true : callLinked === "false" ? false : undefined,
    });
  }

  @Get("attempts/:id")
  async getAttempt(@Param("id") id: string) {
    const a = await this.campaigns.getAttemptById(id);
    if (!a) throw new NotFoundException("Attempt not found");
    return a;
  }

  @Patch("attempts/:id/review")
  async reviewAttempt(@Param("id") id: string, @Body() body: ReviewAttemptDto) {
    return this.campaigns.reviewAttempt(id, body);
  }
}
