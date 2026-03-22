import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { CreateOutboundCampaignDto } from "./dto/create-outbound-campaign.dto";
import { EnqueueDormantDto } from "./dto/enqueue-dormant.dto";
import { EnqueueLeadsDto } from "./dto/enqueue-leads.dto";
import { PatchCampaignActiveDto } from "./dto/patch-campaign-active.dto";
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
    }));
  }

  @Post("campaigns")
  createCampaign(@Body() body: CreateOutboundCampaignDto) {
    return this.campaigns.createCampaign(body);
  }

  @Get("campaigns")
  listCampaigns() {
    return this.campaigns.listCampaigns();
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
}
