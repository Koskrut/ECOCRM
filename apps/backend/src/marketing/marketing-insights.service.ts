import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { MarketingInsightSource, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { pullGoogleInsights } from "./adapters/google.adapter";
import { pullMetaInsights } from "./adapters/meta.adapter";
import { pullTikTokInsights } from "./adapters/tiktok.adapter";
import { CabinetAuthError, type RemoteInsight } from "./adapters/types";
import { MarketingAccountService } from "./marketing-account.service";
import { META_DIRECT_LABEL } from "./marketing.constants";
import { parseSpendCsv } from "./marketing-csv";
import { addDaysYmd, kyivDateString, parseYmd } from "./marketing-time";

@Injectable()
export class MarketingInsightsService {
  private readonly logger = new Logger(MarketingInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: MarketingAccountService,
  ) {}

  async syncRecent(now = new Date()): Promise<void> {
    const until = kyivDateString(now);
    const since = addDaysYmd(until, -3);
    const cabinets = await this.accounts.connected();
    for (const cabinet of cabinets) {
      if (cabinet.status === "DISABLED") continue;
      if (cabinet.spendSource === "file") continue;
      if (!cabinet.hasKey) continue;
      try {
        const rows =
          cabinet.platform === "META"
            ? await pullMetaInsights(cabinet.secrets, since, until)
            : cabinet.platform === "GOOGLE"
              ? await pullGoogleInsights(cabinet.secrets, since, until)
              : await pullTikTokInsights(cabinet.secrets, since, until);
        await this.upsertApiRows(cabinet.platform, cabinet.externalAccountId, rows);
        if (cabinet.status === "NEEDS_RECONNECT") {
          await this.prisma.marketingAccount.updateMany({
            where: { platform: cabinet.platform, externalAccountId: cabinet.externalAccountId },
            data: { status: "CONNECTED" },
          });
        }
      } catch (error) {
        if (error instanceof CabinetAuthError) {
          await this.accounts.markReconnect(cabinet.platform, cabinet.externalAccountId);
        }
        this.logger.warn(
          `${cabinet.platform} insights: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async importGoogleFile(csv: string, fallbackCurrency?: string): Promise<{ days: number; rows: number; errors: string[] }> {
    const parsed = parseSpendCsv(csv);
    if (parsed.rows.length === 0) {
      throw new BadRequestException(parsed.errors[0] ?? "У файлі немає рядків оголошень");
    }
    const google = (await this.accounts.connected()).find((account) => account.platform === "GOOGLE");
    const stored = google ?? (await this.accounts.list()).find((account) => account.platform === "GOOGLE");
    if (!stored) throw new BadRequestException("Спочатку збережіть кабінет Google");
    const currency = fallbackCurrency?.trim().toUpperCase() || stored.currency;
    const dates = [...new Set(parsed.rows.map((row) => row.date))];
    await this.prisma.marketingInsightDaily.deleteMany({
      where: {
        platform: "GOOGLE",
        accountExternalId: stored.externalAccountId,
        date: { in: dates.map((day) => parseYmd(day)) },
      },
    });
    for (const row of parsed.rows) {
      await this.prisma.marketingInsightDaily.create({
        data: {
          platform: "GOOGLE",
          accountExternalId: stored.externalAccountId,
          campaignExternalId: row.campaignExternalId,
          adSetExternalId: row.adSetExternalId,
          adExternalId: row.adExternalId,
          date: parseYmd(row.date),
          spend: new Prisma.Decimal(row.spend),
          impressions: row.impressions,
          clicks: row.clicks,
          currency: row.currency || currency,
          source: "FILE",
        },
      });
      await this.rememberNames("GOOGLE", stored.externalAccountId, {
        campaignExternalId: row.campaignExternalId,
        adSetExternalId: row.adSetExternalId,
        adExternalId: row.adExternalId,
        campaignName: row.campaignName,
        adSetName: row.adSetName,
        adName: row.adName,
        deliveryStatus: "UNKNOWN",
        date: row.date,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        currency: row.currency || currency,
      });
    }
    return { days: dates.length, rows: parsed.rows.length, errors: parsed.errors };
  }

  private async upsertApiRows(
    platform: "META" | "GOOGLE" | "TIKTOK",
    accountExternalId: string,
    rows: RemoteInsight[],
  ): Promise<void> {
    const fileDays = await this.prisma.marketingInsightDaily.findMany({
      where: { platform, accountExternalId, source: "FILE" },
      select: { date: true },
    });
    const blocked = new Set(fileDays.map((row) => row.date.toISOString().slice(0, 10)));
    for (const row of rows) {
      if (!row.adExternalId || !row.date) continue;
      if (blocked.has(row.date)) continue;
      await this.prisma.marketingInsightDaily.upsert({
        where: {
          marketing_insight_ad_day: {
            platform,
            accountExternalId,
            adExternalId: row.adExternalId,
            date: parseYmd(row.date),
          },
        },
        create: {
          platform,
          accountExternalId,
          campaignExternalId: row.campaignExternalId,
          adSetExternalId: row.adSetExternalId,
          adExternalId: row.adExternalId,
          date: parseYmd(row.date),
          spend: new Prisma.Decimal(row.spend),
          impressions: row.impressions,
          clicks: row.clicks,
          currency: row.currency,
          source: MarketingInsightSource.API,
        },
        update: {
          campaignExternalId: row.campaignExternalId,
          adSetExternalId: row.adSetExternalId,
          spend: new Prisma.Decimal(row.spend),
          impressions: row.impressions,
          clicks: row.clicks,
          currency: row.currency,
          source: MarketingInsightSource.API,
        },
      });
      await this.rememberNames(platform, accountExternalId, row);
    }
  }

  private async rememberNames(
    platform: "META" | "GOOGLE" | "TIKTOK",
    accountExternalId: string,
    row: RemoteInsight,
  ): Promise<void> {
    const levels: Array<{ level: "CAMPAIGN" | "AD_SET" | "AD"; id: string; name: string | null; parent: string | null }> = [
      { level: "CAMPAIGN", id: row.campaignExternalId, name: row.campaignName, parent: null },
      { level: "AD_SET", id: row.adSetExternalId, name: row.adSetName, parent: row.campaignExternalId },
      { level: "AD", id: row.adExternalId, name: row.adName, parent: row.adSetExternalId },
    ];
    for (const level of levels) {
      if (!level.id) continue;
      await this.prisma.marketingEntity.upsert({
        where: {
          marketing_entity_key: {
            platform,
            accountExternalId,
            level: level.level,
            externalId: level.id,
          },
        },
        create: {
          platform,
          accountExternalId,
          level: level.level,
          externalId: level.id,
          parentExternalId: level.parent,
          name: level.name || level.id,
          deliveryStatus: level.level === "AD" ? row.deliveryStatus : "UNKNOWN",
        },
        update: {
          ...(level.name ? { name: level.name } : {}),
          parentExternalId: level.parent,
          ...(level.level === "AD" ? { deliveryStatus: row.deliveryStatus } : {}),
        },
      });
    }
    if (row.adName) {
      await this.prisma.marketingLeadTouch.updateMany({
        where: {
          platform,
          adExternalId: row.adExternalId,
          OR: [{ displayName: null }, { displayName: "" }, { displayName: META_DIRECT_LABEL }],
        },
        data: { displayName: row.adName },
      });
    }
  }
}
