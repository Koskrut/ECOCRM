import { BadRequestException, Injectable } from "@nestjs/common";
import { OutboundAttemptStatus, OutboundTargetType } from "@prisma/client";
import { getPhoneNormalizedDigits } from "../common/phone.utils";
import { ModuleIds } from "../modules/module-ids";
import { ModuleStateService } from "../modules/module-state.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MarketingAiCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modules: ModuleStateService,
  ) {}

  async enabled(): Promise<boolean> {
    return this.modules.isEffective(ModuleIds.VoiceOutbound);
  }

  async campaigns() {
    if (!(await this.enabled())) return [];
    const rows = await this.prisma.outboundCampaign.findMany({
      where: { isActive: true, targetType: OutboundTargetType.LEAD },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows;
  }

  async preview(input: { outboundCampaignId: string; platform?: string; campaignExternalId?: string }) {
    await this.assertOutbound();
    const leads = await this.eligible(input);
    return { count: leads.length };
  }

  async enqueue(input: { outboundCampaignId: string; platform?: string; campaignExternalId?: string }) {
    await this.assertOutbound();
    const campaign = await this.prisma.outboundCampaign.findUnique({ where: { id: input.outboundCampaignId } });
    if (!campaign || campaign.targetType !== OutboundTargetType.LEAD || !campaign.isActive) {
      throw new BadRequestException("Оберіть активну кампанію обзвону по заявках");
    }
    const leads = await this.eligible(input);
    const scheduledAt = new Date();
    let created = 0;
    for (const lead of leads) {
      const digits = getPhoneNormalizedDigits(lead.phone ?? lead.phoneNormalized ?? "");
      if (!digits) continue;
      await this.prisma.outboundCallAttempt.create({
        data: {
          campaignId: campaign.id,
          targetType: OutboundTargetType.LEAD,
          leadId: lead.id,
          companyId: lead.companyId,
          phoneNormalized: digits,
          scenarioCode: campaign.scenarioCode,
          scenarioVersion: campaign.scenarioVersion,
          status: OutboundAttemptStatus.PENDING,
          scheduledAt,
        },
      });
      created += 1;
    }
    return { created, count: leads.length };
  }

  private async assertOutbound() {
    if (!(await this.enabled())) throw new BadRequestException("Розділ AI-дзвінків вимкнено");
  }

  private async eligible(input: { outboundCampaignId: string; platform?: string; campaignExternalId?: string }) {
    const platform =
      input.platform === "META" || input.platform === "GOOGLE" || input.platform === "TIKTOK" ? input.platform : undefined;
    const leads = await this.prisma.lead.findMany({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        marketingTouch: {
          countsTowardAds: true,
          ...(platform ? { platform } : {}),
          ...(input.campaignExternalId ? { campaignExternalId: input.campaignExternalId } : {}),
        },
        OR: [{ contactId: null }, { contact: { marketingCallOptOut: false } }],
      },
      select: {
        id: true,
        phone: true,
        phoneNormalized: true,
        companyId: true,
        contact: { select: { marketingCallOptOut: true } },
      },
    });
    const withPhone = leads.filter(
      (lead) => !lead.contact?.marketingCallOptOut && getPhoneNormalizedDigits(lead.phone ?? lead.phoneNormalized ?? ""),
    );
    if (withPhone.length === 0) return [];
    const existing = await this.prisma.outboundCallAttempt.findMany({
      where: { campaignId: input.outboundCampaignId, leadId: { in: withPhone.map((lead) => lead.id) } },
      select: { leadId: true },
    });
    const queued = new Set(existing.map((row) => row.leadId));
    return withPhone.filter((lead) => !queued.has(lead.id));
  }
}
