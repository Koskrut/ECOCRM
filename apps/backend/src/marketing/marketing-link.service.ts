import { BadRequestException, Injectable } from "@nestjs/common";
import { MarketingLinkChannel } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { channelPlatform } from "./marketing-attribution";

const CHANNELS: MarketingLinkChannel[] = ["FACEBOOK", "INSTAGRAM", "GOOGLE", "TIKTOK", "OTHER"];

function slug(name: string): string {
  const value = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return value || "link";
}

function utmSource(channel: MarketingLinkChannel): string {
  if (channel === "FACEBOOK") return "facebook";
  if (channel === "INSTAGRAM") return "instagram";
  if (channel === "GOOGLE") return "google";
  if (channel === "TIKTOK") return "tiktok";
  return "other";
}

@Injectable()
export class MarketingLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async list() {
    const links = await this.prisma.marketingLink.findMany({ orderBy: { createdAt: "desc" } });
    const counts = links.length
      ? await this.prisma.marketingLeadTouch.groupBy({
          by: ["linkId"],
          where: { linkId: { in: links.map((link) => link.id) } },
          _count: { _all: true },
        })
      : [];
    const byId = new Map(counts.map((row) => [row.linkId, row._count._all]));
    return links.map((link) => ({
      id: link.id,
      channel: link.channel,
      name: link.name,
      campaignExternalId: link.campaignExternalId,
      fullUrl: link.fullUrl,
      leads: byId.get(link.id) ?? 0,
      countsAsCampaign: Boolean(link.campaignExternalId),
    }));
  }

  async campaignChoices() {
    const rows = await this.prisma.marketingEntity.findMany({
      where: { level: "CAMPAIGN" },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      platform: row.platform,
      externalId: row.externalId,
      name: row.name,
    }));
  }

  async create(input: { channel: MarketingLinkChannel; name: string; campaignExternalId?: string | null }) {
    if (!CHANNELS.includes(input.channel)) throw new BadRequestException("Оберіть майданчик");
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Вкажіть назву");
    const store = await this.settings.getStoreConfig();
    const base = (store.publicStoreUrl || process.env.STORE_PUBLIC_URL || "").replace(/\/+$/, "");
    if (!base) throw new BadRequestException("Спочатку вкажіть адресу магазину");
    const campaignExternalId = input.campaignExternalId?.trim() || null;
    if (campaignExternalId) {
      const known = await this.prisma.marketingEntity.findFirst({
        where: { level: "CAMPAIGN", externalId: campaignExternalId },
      });
      if (!known) throw new BadRequestException("Оберіть кампанію, яка вже є в кабінеті");
      const expected = channelPlatform(input.channel);
      if (expected !== "OTHER" && known.platform !== expected) {
        throw new BadRequestException("Кампанія належить іншому майданчику");
      }
    }
    const created = await this.prisma.marketingLink.create({
      data: {
        channel: input.channel,
        name,
        campaignExternalId,
        fullUrl: base,
        utmSource: utmSource(input.channel),
        utmMedium: "paid",
        utmCampaign: slug(name),
      },
    });
    const url = new URL(base.includes("://") ? base : `https://${base}`);
    url.searchParams.set("utm_source", created.utmSource ?? utmSource(input.channel));
    url.searchParams.set("utm_medium", "paid");
    url.searchParams.set("utm_campaign", created.utmCampaign ?? slug(name));
    url.searchParams.set("utm_content", created.id);
    const fullUrl = url.toString();
    return this.prisma.marketingLink.update({
      where: { id: created.id },
      data: { fullUrl, utmContent: created.id },
    });
  }

  async remove(id: string) {
    await this.prisma.marketingLink.delete({ where: { id } });
    return { ok: true };
  }
}
