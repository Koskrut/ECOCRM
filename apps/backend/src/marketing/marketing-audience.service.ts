import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { MarketingAudiencePreset, MarketingPlatform, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_STAGE_LABELS } from "../leads/pipeline/lead-pipeline.defaults";
import { createMetaAudience, createMetaLookalike, deleteMetaAudience, uploadMetaAudience } from "./adapters/meta.adapter";
import { googleCampaignUrl, uploadGoogleAudience } from "./adapters/google.adapter";
import { tiktokCampaignUrl, uploadTikTokAudience } from "./adapters/tiktok.adapter";
import { CabinetAuthError, type HashedPerson } from "./adapters/types";
import { MarketingAccountService } from "./marketing-account.service";
import { dedupeAudience, shouldHaltShrink, type AudiencePerson } from "./marketing-audience.rules";
import { hashEmailForAds, hashOptionalName, hashPhoneForAds } from "./marketing-hash";
import {
  DORMANT_DAYS_DEFAULT,
  LOOKALIKE_MIN,
  META_AUDIENCE_MIN,
  OTHER_AUDIENCE_MIN,
} from "./marketing.constants";

const PRESETS: MarketingAudiencePreset[] = [
  "CLIENTS",
  "LARGE_CLIENTS",
  "DORMANT",
  "OPEN_LEADS",
  "LOST",
  "JUNK_EXCLUSION",
];
const PLATFORMS: Array<"META" | "GOOGLE" | "TIKTOK"> = ["META", "GOOGLE", "TIKTOK"];

type AudienceConfig = {
  threshold?: number | null;
  dormantDays?: number;
  consentConfirmed?: boolean;
  lookalikeExternalId?: string | null;
};

const SHRINK_TEXT = "Список різко зменшився, попередній залишено";

@Injectable()
export class MarketingAudienceService {
  private readonly logger = new Logger(MarketingAudienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: MarketingAccountService,
  ) {}

  async list() {
    const usableAccounts = await this.prisma.marketingAccount.findMany({
      where: {
        platform: { in: [...PLATFORMS] },
        status: { in: ["CONNECTED", "NEEDS_RECONNECT"] },
      },
      select: { platform: true },
    });
    const usablePlatforms = new Set(usableAccounts.map((account) => account.platform));
    if (usablePlatforms.size === 0) return [];

    await this.ensureRows();
    const labels = await this.stageLabels();
    const rows = await this.prisma.marketingAudience.findMany({ orderBy: [{ preset: "asc" }, { platform: "asc" }] });
    return rows
      .filter((row) => row.platform !== "OTHER" && usablePlatforms.has(row.platform))
      .map((row) => {
        const config = this.config(row.config);
        const minimum = row.platform === "META" ? META_AUDIENCE_MIN : OTHER_AUDIENCE_MIN;
        return {
          id: row.id,
          preset: row.preset,
          platform: row.platform,
          enabled: row.enabled,
          title: this.title(row.preset),
          hint: this.hint(row.preset, labels, config),
          status: row.status,
          lastSize: row.lastSize,
          skippedNoContact: row.lastSkippedNoContact ?? 0,
          lastError: row.status === "STOPPED" && !row.lastError ? SHRINK_TEXT : row.lastError,
          lastSyncedAt: row.lastSyncedAt,
          consentConfirmed: Boolean(config.consentConfirmed),
          threshold: config.threshold ?? null,
          dormantDays: config.dormantDays ?? DORMANT_DAYS_DEFAULT,
          minimum,
          canLookalike:
            (row.preset === "CLIENTS" || row.preset === "LARGE_CLIENTS") &&
            row.status === "UPDATED" &&
            (row.lastSize ?? 0) >= LOOKALIKE_MIN,
          lookalikeMode: row.platform === "META" ? "create" : "open",
        };
      });
  }

  async sync(
    id: string,
    input: { confirmRights?: boolean; force?: boolean; threshold?: number; dormantDays?: number },
  ) {
    const row = await this.prisma.marketingAudience.findUnique({ where: { id } });
    if (!row || row.platform === "OTHER") throw new BadRequestException("Список не знайдено");
    if (!row.enabled) throw new BadRequestException("Список зупинено");
    const config = this.config(row.config);
    if (!config.consentConfirmed && input.confirmRights !== true) {
      throw new BadRequestException("Маємо право передавати контакти в рекламні кабінети");
    }
    const nextConfig: AudienceConfig = {
      ...config,
      consentConfirmed: true,
      ...(input.threshold != null ? { threshold: input.threshold } : {}),
      ...(input.dormantDays != null ? { dormantDays: input.dormantDays } : {}),
    };
    if (row.preset === "LARGE_CLIENTS" && (nextConfig.threshold == null || nextConfig.threshold <= 0)) {
      throw new BadRequestException("Вкажіть суму оплат до першого оновлення");
    }
    await this.prisma.marketingAudience.update({
      where: { id },
      data: { status: "RUNNING", config: nextConfig as Prisma.InputJsonValue, lastError: null },
    });
    const sync = await this.prisma.marketingAudienceSync.create({
      data: { audienceId: id, status: "RUNNING", previousSize: row.lastSize, forced: Boolean(input.force) },
    });
    try {
      const built = dedupeAudience(await this.collect(row.preset, nextConfig));
      if (shouldHaltShrink(row.lastSize, built.people.length, Boolean(input.force))) {
        await this.finish(id, sync.id, {
          status: "STOPPED",
          size: row.lastSize,
          skipped: built.skippedNoContact,
          error: SHRINK_TEXT,
          halted: true,
          externalAudienceId: row.externalAudienceId,
          config: nextConfig,
        });
        return { status: "STOPPED", message: SHRINK_TEXT, size: row.lastSize, skippedNoContact: built.skippedNoContact };
      }
      const cabinet = (await this.accounts.connected()).find(
        (item) => item.platform === row.platform && item.status === "CONNECTED" && item.hasKey,
      );
      if (!cabinet) throw new CabinetAuthError();
      const hashed = built.people.map((person) => this.hashPerson(person));
      const name = this.title(row.preset);
      let externalId = row.externalAudienceId;
      if (row.platform === "META") {
        const created = await createMetaAudience(cabinet.secrets, name);
        try {
          if (hashed.length > 0) await uploadMetaAudience(cabinet.secrets, created, hashed);
        } catch (error) {
          await deleteMetaAudience(cabinet.secrets, created);
          throw error;
        }
        if (externalId && externalId !== created) await deleteMetaAudience(cabinet.secrets, externalId);
        externalId = created;
      } else if (row.platform === "GOOGLE") {
        externalId = await uploadGoogleAudience(cabinet.secrets, name, hashed);
      } else {
        externalId = await uploadTikTokAudience(cabinet.secrets, name, hashed);
      }
      await this.finish(id, sync.id, {
        status: "UPDATED",
        size: built.people.length,
        skipped: built.skippedNoContact,
        error: null,
        halted: false,
        externalAudienceId: externalId,
        config: nextConfig,
        synced: true,
      });
      return { status: "UPDATED", size: built.people.length, skippedNoContact: built.skippedNoContact };
    } catch (error) {
      const message = error instanceof CabinetAuthError ? "Потрібне повторне підключення" : error instanceof Error ? error.message : "Не вдалося оновити список";
      if (error instanceof CabinetAuthError) {
        const cabinet = (await this.accounts.connected()).find((item) => item.platform === row.platform);
        if (cabinet) await this.accounts.markReconnect(cabinet.platform, cabinet.externalAccountId);
      }
      await this.finish(id, sync.id, {
        status: "FAILED",
        size: row.lastSize,
        skipped: row.lastSkippedNoContact ?? 0,
        error: message,
        halted: false,
        externalAudienceId: row.externalAudienceId,
        config: nextConfig,
      });
      this.logger.warn(`audience ${id}: ${message}`);
      return { status: "FAILED", message, size: row.lastSize, skippedNoContact: row.lastSkippedNoContact ?? 0 };
    }
  }

  async lookalike(id: string) {
    const row = await this.prisma.marketingAudience.findUnique({ where: { id } });
    if (!row) throw new BadRequestException("Список не знайдено");
    if (row.preset !== "CLIENTS" && row.preset !== "LARGE_CLIENTS") {
      throw new BadRequestException("Схожі клієнти доступні лише для клієнтів");
    }
    if (row.status !== "UPDATED" || (row.lastSize ?? 0) < LOOKALIKE_MIN) {
      throw new BadRequestException("Для схожих клієнтів потрібно щонайменше 100 людей");
    }
    const cabinet = (await this.accounts.connected()).find((item) => item.platform === row.platform);
    if (!cabinet) throw new BadRequestException("Потрібне повторне підключення");
    if (row.platform === "GOOGLE") {
      return { mode: "open" as const, url: googleCampaignUrl(cabinet.externalAccountId, "") };
    }
    if (row.platform === "TIKTOK") {
      return { mode: "open" as const, url: tiktokCampaignUrl(cabinet.externalAccountId) };
    }
    const config = this.config(row.config);
    if (config.lookalikeExternalId) return { mode: "ready" as const, id: config.lookalikeExternalId };
    if (!row.externalAudienceId || !cabinet.hasKey) throw new BadRequestException("Потрібне повторне підключення");
    const created = await createMetaLookalike(cabinet.secrets, row.externalAudienceId, `${this.title(row.preset)} — схожі`);
    await this.prisma.marketingAudience.update({
      where: { id },
      data: { config: { ...config, lookalikeExternalId: created } as Prisma.InputJsonValue },
    });
    return { mode: "ready" as const, id: created };
  }

  private async finish(
    id: string,
    syncId: string,
    input: {
      status: "UPDATED" | "FAILED" | "STOPPED";
      size: number | null;
      skipped: number;
      error: string | null;
      halted: boolean;
      externalAudienceId: string | null;
      config: AudienceConfig;
      synced?: boolean;
    },
  ) {
    await this.prisma.marketingAudience.update({
      where: { id },
      data: {
        status: input.status,
        lastSize: input.status === "UPDATED" ? input.size : undefined,
        lastSkippedNoContact: input.skipped,
        lastError: input.error,
        externalAudienceId: input.externalAudienceId,
        config: input.config as Prisma.InputJsonValue,
        ...(input.synced ? { lastSyncedAt: new Date() } : {}),
      },
    });
    await this.prisma.marketingAudienceSync.update({
      where: { id: syncId },
      data: {
        status: input.status,
        size: input.size,
        skippedNoContact: input.skipped,
        halted: input.halted,
        error: input.error,
        finishedAt: new Date(),
      },
    });
  }

  private async collect(preset: MarketingAudiencePreset, config: AudienceConfig): Promise<AudiencePerson[]> {
    if (preset === "CLIENTS" || preset === "LARGE_CLIENTS" || preset === "DORMANT") {
      const dormantDays = config.dormantDays ?? DORMANT_DAYS_DEFAULT;
      const cutoff = new Date(Date.now() - dormantDays * 86_400_000);
      const rows = await this.prisma.$queryRaw<
        Array<{ phone: string | null; email: string | null; firstName: string | null; lastName: string | null; city: string | null; total: unknown; lastOrder: Date | null }>
      >(Prisma.sql`
        SELECT c.phone, c.email, c."firstName" AS "firstName", c."lastName" AS "lastName", c.city,
               COALESCE(SUM(p.amount), 0) AS total,
               MAX(o."createdAt") AS "lastOrder"
        FROM "Contact" c
        INNER JOIN "Order" o ON (o."clientId" = c.id OR o."contactId" = c.id)
        INNER JOIN "Payment" p ON p."orderId" = o.id
          AND p.status = 'COMPLETED'
          AND p."sourceType"::text IN ('BANK', 'CASH', 'ONE_C')
        WHERE c."marketingAdsOptOut" = false
        GROUP BY c.id
      `);
      return rows
        .filter((row) => {
          const total = Number(row.total ?? 0);
          if (preset === "LARGE_CLIENTS") return total >= (config.threshold ?? Number.POSITIVE_INFINITY);
          if (preset === "DORMANT") return total > 0 && row.lastOrder != null && row.lastOrder < cutoff;
          return total > 0;
        })
        .map((row) => ({
          phone: row.phone,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          city: row.city,
        }));
    }

    const statuses =
      preset === "OPEN_LEADS" ? (["NEW", "IN_PROGRESS"] as const) : preset === "LOST" ? (["LOST"] as const) : (["SPAM", "NOT_TARGET"] as const);
    const leads = await this.prisma.lead.findMany({
      where: {
        status: { in: [...statuses] },
        OR: [{ contactId: null }, { contact: { marketingAdsOptOut: false } }],
      },
      select: {
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        city: true,
        contact: {
          select: { phone: true, email: true, firstName: true, lastName: true, city: true, marketingAdsOptOut: true },
        },
      },
    });
    return leads
      .filter((lead) => !lead.contact?.marketingAdsOptOut)
      .map((lead) => ({
        phone: lead.contact?.phone || lead.phone,
        email: lead.contact?.email || lead.email,
        firstName: lead.contact?.firstName || lead.firstName,
        lastName: lead.contact?.lastName || lead.lastName,
        city: lead.contact?.city || lead.city,
      }));
  }

  private hashPerson(person: AudiencePerson): HashedPerson {
    return {
      phoneHash: hashPhoneForAds(person.phone),
      emailHash: hashEmailForAds(person.email),
      firstNameHash: hashOptionalName(person.firstName),
      lastNameHash: hashOptionalName(person.lastName),
      cityHash: hashOptionalName(person.city),
    };
  }

  private async ensureRows() {
    for (const preset of PRESETS) {
      for (const platform of PLATFORMS) {
        await this.prisma.marketingAudience.upsert({
          where: { preset_platform: { preset, platform: platform as MarketingPlatform } },
          create: { preset, platform: platform as MarketingPlatform, config: { dormantDays: DORMANT_DAYS_DEFAULT } },
          update: {},
        });
      }
    }
  }

  private async stageLabels(): Promise<Record<string, string>> {
    const rows = await this.prisma.leadPipelineStage.findMany();
    const labels: Record<string, string> = { ...DEFAULT_STAGE_LABELS };
    for (const row of rows) labels[row.status] = row.label;
    return labels;
  }

  private title(preset: MarketingAudiencePreset): string {
    switch (preset) {
      case "CLIENTS":
        return "Клієнти";
      case "LARGE_CLIENTS":
        return "Великі клієнти";
      case "DORMANT":
        return "Давно не купували";
      case "OPEN_LEADS":
        return "Заявки в роботі";
      case "LOST":
        return "Провалені";
      case "JUNK_EXCLUSION":
        return "Не показувати: спам і нецільові";
      default:
        return preset;
    }
  }

  private hint(preset: MarketingAudiencePreset, labels: Record<string, string>, config: AudienceConfig): string {
    switch (preset) {
      case "CLIENTS":
        return "Є оплачене замовлення. Для допродажу і щоб у кабінеті виключити своїх із набору нових.";
      case "LARGE_CLIENTS":
        return config.threshold
          ? `Сума оплат не нижче ${config.threshold}.`
          : "Сума оплат не нижче суми, яку задають до першого оновлення.";
      case "DORMANT":
        return `Оплати були, нового замовлення немає ${config.dormantDays ?? DORMANT_DAYS_DEFAULT} днів.`;
      case "OPEN_LEADS":
        return `Тільки «${labels.NEW}» і «${labels.IN_PROGRESS}», з телефоном або поштою.`;
      case "LOST":
        return `«${labels.LOST}» — окремий прогрів, не автоматичне виключення.`;
      case "JUNK_EXCLUSION":
        return `Лише виключення: «${labels.SPAM}» і «${labels.NOT_TARGET}».`;
      default:
        return "";
    }
  }

  private config(value: unknown): AudienceConfig {
    if (!value || typeof value !== "object") return {};
    return value as AudienceConfig;
  }
}
