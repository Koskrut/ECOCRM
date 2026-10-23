import { BadRequestException, Injectable } from "@nestjs/common";
import { MarketingAccountStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CabinetSecrets } from "./adapters/types";
import {
  DEFAULT_PAYMENT_WINDOW_DAYS,
  isPaymentWindow,
  MARKETING_FLAGS_PROVIDER,
  MARKETING_PROVIDERS,
  type CabinetPlatform,
  type PaymentWindowDays,
} from "./marketing.constants";

type StoredConfig = {
  externalAccountId?: string;
  name?: string;
  currency?: string;
  pixelId?: string | null;
  spendSource?: "api" | "file";
  lostAsJunk?: boolean;
  paymentWindowDays?: number;
  developerToken?: string | null;
  loginCustomerId?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  qualityConversionActionId?: string | null;
  junkConversionActionId?: string | null;
  purchaseConversionActionId?: string | null;
};

export type PublicAccount = {
  platform: CabinetPlatform;
  externalAccountId: string;
  name: string;
  currency: string;
  status: MarketingAccountStatus;
  spendSource: "api" | "file";
  hasKey: boolean;
  pixelId: string | null;
  qualityConversionActionId: string | null;
  junkConversionActionId: string | null;
  purchaseConversionActionId: string | null;
};

export type CabinetContext = PublicAccount & { secrets: CabinetSecrets };

@Injectable()
export class MarketingAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicAccount[]> {
    const accounts = await this.prisma.marketingAccount.findMany({ orderBy: { platform: "asc" } });
    const settings = await this.prisma.integrationSetting.findMany({
      where: { provider: { in: Object.values(MARKETING_PROVIDERS) } },
    });
    const byProvider = new Map(settings.map((row) => [row.provider, row]));
    return accounts.map((account) => {
      const provider = MARKETING_PROVIDERS[account.platform as CabinetPlatform];
      const setting = provider ? byProvider.get(provider) : undefined;
      const config = this.readConfig(setting?.config);
      return {
        platform: account.platform as CabinetPlatform,
        externalAccountId: account.externalAccountId,
        name: account.name,
        currency: account.currency,
        status: account.status,
        spendSource: account.spendSource === "file" ? "file" : "api",
        hasKey: Boolean(setting?.apiToken),
        pixelId: config.pixelId ?? null,
        qualityConversionActionId: config.qualityConversionActionId ?? null,
        junkConversionActionId: config.junkConversionActionId ?? null,
        purchaseConversionActionId: config.purchaseConversionActionId ?? null,
      };
    });
  }

  async flags(): Promise<{ lostAsJunk: boolean; paymentWindowDays: PaymentWindowDays }> {
    const settings = await this.prisma.integrationSetting.findMany({
      where: { provider: { in: [...Object.values(MARKETING_PROVIDERS), MARKETING_FLAGS_PROVIDER] } },
    });
    let lostAsJunk = false;
    let paymentWindowDays: PaymentWindowDays = DEFAULT_PAYMENT_WINDOW_DAYS;
    for (const row of settings) {
      const config = this.readConfig(row.config);
      if (config.lostAsJunk) lostAsJunk = true;
      if (typeof config.paymentWindowDays === "number" && isPaymentWindow(config.paymentWindowDays)) {
        paymentWindowDays = config.paymentWindowDays;
      }
    }
    return { lostAsJunk, paymentWindowDays };
  }

  async saveFlags(input: { lostAsJunk?: boolean; paymentWindowDays?: number }): Promise<void> {
    const window = input.paymentWindowDays;
    if (window != null && !isPaymentWindow(window)) {
      throw new BadRequestException("Вікно оплат може бути 7, 30 або 90 днів");
    }
    const settings = await this.prisma.integrationSetting.findMany({
      where: { provider: { in: [...Object.values(MARKETING_PROVIDERS), MARKETING_FLAGS_PROVIDER] } },
    });
    if (!settings.some((row) => row.provider === MARKETING_FLAGS_PROVIDER)) {
      await this.prisma.integrationSetting.create({
        data: {
          id: MARKETING_FLAGS_PROVIDER,
          provider: MARKETING_FLAGS_PROVIDER,
          isEnabled: true,
          config: {
            lostAsJunk: Boolean(input.lostAsJunk),
            ...(window != null ? { paymentWindowDays: window } : {}),
          } as Prisma.InputJsonValue,
        },
      });
    }
    for (const row of settings) {
      const config = this.readConfig(row.config);
      const next: StoredConfig = {
        ...config,
        ...(input.lostAsJunk != null ? { lostAsJunk: input.lostAsJunk } : {}),
        ...(window != null ? { paymentWindowDays: window } : {}),
      };
      await this.prisma.integrationSetting.update({
        where: { id: row.id },
        data: { config: next as Prisma.InputJsonValue },
      });
    }
  }

  async upsert(input: {
    platform: CabinetPlatform;
    externalAccountId: string;
    name: string;
    currency: string;
    accessKey?: string;
    pixelId?: string | null;
    spendSource?: "api" | "file";
    developerToken?: string | null;
    loginCustomerId?: string | null;
    clientId?: string | null;
    clientSecret?: string | null;
    qualityConversionActionId?: string | null;
    junkConversionActionId?: string | null;
    purchaseConversionActionId?: string | null;
  }): Promise<PublicAccount> {
    const externalAccountId = input.externalAccountId.trim();
    const name = input.name.trim();
    const currency = input.currency.trim().toUpperCase();
    if (!externalAccountId || !name || !currency) {
      throw new BadRequestException("Вкажіть номер, назву і валюту кабінету");
    }
    const provider = MARKETING_PROVIDERS[input.platform];
    const existing = await this.prisma.integrationSetting.findUnique({ where: { id: provider } });
    const previous = this.readConfig(existing?.config);
    const flags = await this.flags();
    const spendSource = input.platform === "GOOGLE" && input.spendSource === "file" ? "file" : input.spendSource === "file" ? "file" : "api";
    const apiToken = input.accessKey?.trim() ? input.accessKey.trim() : existing?.apiToken ?? null;
    const next: StoredConfig = {
      ...previous,
      externalAccountId,
      name,
      currency,
      pixelId: input.pixelId?.trim() || previous.pixelId || null,
      spendSource,
      lostAsJunk: previous.lostAsJunk ?? flags.lostAsJunk,
      paymentWindowDays: previous.paymentWindowDays ?? flags.paymentWindowDays,
      developerToken: input.developerToken?.trim() || previous.developerToken || null,
      loginCustomerId: input.loginCustomerId?.trim() || previous.loginCustomerId || null,
      clientId: input.clientId?.trim() || previous.clientId || null,
      clientSecret: input.clientSecret?.trim() || previous.clientSecret || null,
      qualityConversionActionId:
        input.qualityConversionActionId != null
          ? input.qualityConversionActionId.trim() || null
          : previous.qualityConversionActionId || null,
      junkConversionActionId:
        input.junkConversionActionId != null
          ? input.junkConversionActionId.trim() || null
          : previous.junkConversionActionId || null,
      purchaseConversionActionId:
        input.purchaseConversionActionId != null
          ? input.purchaseConversionActionId.trim() || null
          : previous.purchaseConversionActionId || null,
    };
    const connected = Boolean(apiToken) || spendSource === "file";
    const previousAccount = await this.prisma.marketingAccount.findUnique({
      where: { platform_externalAccountId: { platform: input.platform, externalAccountId } },
    });
    const keepReconnect =
      !input.accessKey?.trim() && spendSource !== "file" && previousAccount?.status === "NEEDS_RECONNECT";
    const status = !connected ? "DISABLED" : keepReconnect ? "NEEDS_RECONNECT" : "CONNECTED";
    await this.prisma.integrationSetting.upsert({
      where: { id: provider },
      create: {
        id: provider,
        provider,
        isEnabled: connected,
        apiToken,
        config: next as Prisma.InputJsonValue,
      },
      update: {
        isEnabled: connected,
        apiToken,
        config: next as Prisma.InputJsonValue,
      },
    });
    await this.prisma.marketingAccount.upsert({
      where: { platform_externalAccountId: { platform: input.platform, externalAccountId } },
      create: {
        platform: input.platform,
        externalAccountId,
        name,
        currency,
        status,
        spendSource,
      },
      update: {
        name,
        currency,
        status,
        spendSource,
      },
    });
    return {
      platform: input.platform,
      externalAccountId,
      name,
      currency,
      status,
      spendSource,
      hasKey: Boolean(apiToken),
      pixelId: next.pixelId ?? null,
      qualityConversionActionId: next.qualityConversionActionId ?? null,
      junkConversionActionId: next.junkConversionActionId ?? null,
      purchaseConversionActionId: next.purchaseConversionActionId ?? null,
    };
  }

  async markReconnect(platform: CabinetPlatform, externalAccountId: string): Promise<void> {
    await this.prisma.marketingAccount.updateMany({
      where: { platform, externalAccountId },
      data: { status: "NEEDS_RECONNECT" },
    });
  }

  async connected(): Promise<CabinetContext[]> {
    const accounts = await this.prisma.marketingAccount.findMany({
      where: { status: { in: ["CONNECTED", "NEEDS_RECONNECT"] } },
    });
    const result: CabinetContext[] = [];
    for (const account of accounts) {
      const platform = account.platform as CabinetPlatform;
      if (!(platform in MARKETING_PROVIDERS)) continue;
      const setting = await this.prisma.integrationSetting.findUnique({
        where: { id: MARKETING_PROVIDERS[platform] },
      });
      const config = this.readConfig(setting?.config);
      result.push({
        platform,
        externalAccountId: account.externalAccountId,
        name: account.name,
        currency: account.currency,
        status: account.status,
        spendSource: account.spendSource === "file" ? "file" : "api",
        hasKey: Boolean(setting?.apiToken),
        pixelId: config.pixelId ?? null,
        qualityConversionActionId: config.qualityConversionActionId ?? null,
        junkConversionActionId: config.junkConversionActionId ?? null,
        purchaseConversionActionId: config.purchaseConversionActionId ?? null,
        secrets: {
          platform,
          externalAccountId: account.externalAccountId,
          currency: account.currency,
          accessToken: setting?.apiToken ?? null,
          pixelId: config.pixelId ?? null,
          developerToken: config.developerToken ?? null,
          loginCustomerId: config.loginCustomerId ?? null,
          clientId: config.clientId ?? null,
          clientSecret: config.clientSecret ?? null,
          qualityConversionActionId: config.qualityConversionActionId ?? null,
          junkConversionActionId: config.junkConversionActionId ?? null,
          purchaseConversionActionId: config.purchaseConversionActionId ?? null,
        },
      });
    }
    return result;
  }

  private readConfig(value: unknown): StoredConfig {
    if (!value || typeof value !== "object") return {};
    return value as StoredConfig;
  }
}
