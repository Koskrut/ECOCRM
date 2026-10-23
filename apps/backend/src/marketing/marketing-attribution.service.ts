import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { META_DIRECT_LABEL } from "./marketing.constants";
import {
  matchMarketingLink,
  readClickFromSourceMeta,
  resolveMarketingAttribution,
  type ClickTouch,
} from "./marketing-attribution";

@Injectable()
export class MarketingAttributionService {
  private readonly logger = new Logger(MarketingAttributionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async attributeLead(
    leadId: string,
    extra?: { direct?: { adId?: string | null; campaignId?: string | null; adsetId?: string | null; adName?: string | null } },
  ): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { attribution: true, marketingTouch: true },
    });
    if (!lead) return;

    const links = await this.prisma.marketingLink.findMany();
    const campaigns = await this.prisma.marketingEntity.findMany({
      where: { level: "CAMPAIGN" },
      select: { externalId: true },
    });
    const click = readClickFromSourceMeta(lead.sourceMeta);
    const link = matchMarketingLink(click, links);
    const stored = lead.marketingTouch;
    const direct =
      extra?.direct?.adId
        ? extra.direct
        : stored?.resolvedFrom === "meta_direct" && stored.adExternalId
          ? {
              adId: stored.adExternalId,
              campaignId: stored.campaignExternalId,
              adsetId: stored.adSetExternalId,
              adName: stored.displayName === META_DIRECT_LABEL ? null : stored.displayName,
            }
          : null;

    const decision = resolveMarketingAttribution({
      channel: lead.channel,
      metaForm: lead.attribution
        ? {
            campaignId: lead.attribution.campaignId,
            adsetId: lead.attribution.adsetId,
            adId: lead.attribution.adId,
            campaignName: lead.attribution.campaignName,
            adName: lead.attribution.adName,
          }
        : null,
      direct,
      click,
      link,
      knownCampaignIds: campaigns.map((row) => row.externalId),
    });

    await this.prisma.marketingLeadTouch.upsert({
      where: { leadId },
      create: {
        leadId,
        platform: decision.platform,
        campaignExternalId: decision.campaignExternalId,
        adSetExternalId: decision.adSetExternalId,
        adExternalId: decision.adExternalId,
        clickId: decision.clickId,
        linkId: decision.linkId,
        displayName: decision.displayName,
        countsTowardAds: decision.countsTowardAds,
        resolvedFrom: decision.resolvedFrom,
      },
      update: {
        platform: decision.platform,
        campaignExternalId: decision.campaignExternalId,
        adSetExternalId: decision.adSetExternalId,
        adExternalId: decision.adExternalId,
        clickId: decision.clickId,
        linkId: decision.linkId,
        displayName: decision.displayName,
        countsTowardAds: decision.countsTowardAds,
        resolvedFrom: decision.resolvedFrom,
      },
    });

  }

  async rememberDirect(
    leadId: string,
    referral: { adId?: string | null; campaignId?: string | null; adsetId?: string | null; adName?: string | null },
  ): Promise<void> {
    if (!referral.adId?.trim()) return;
    await this.attributeLead(leadId, { direct: referral });
  }

  async backfill(limit = 200): Promise<number> {
    const leads = await this.prisma.lead.findMany({
      where: { marketingTouch: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    for (const lead of leads) {
      try {
        await this.attributeLead(lead.id);
      } catch (error) {
        this.logger.warn(`attribute ${lead.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return leads.length;
  }

  clickFromUnknown(value: unknown): ClickTouch | null {
    return readClickFromSourceMeta(value);
  }
}
