import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RINGOSTAT_PROVIDER } from "../integrations/ringostat/ringostat-ingest.service";

export type ExchangeRates = {
  UAH_TO_USD: number;
  EUR_TO_USD: number;
};

const EXCHANGE_RATES_KEY = "exchange_rates";
const DEFAULT_RATES: ExchangeRates = {
  UAH_TO_USD: 0.024,
  EUR_TO_USD: 1.05,
};

export type MetaLeadAdsConfig = {
  webhookVerifyToken?: string;
  pageAccessToken?: string;
  companyId?: string;
};

const META_LEAD_ADS_KEY = "meta_lead_ads";

export type GoogleMapsConfig = {
  mapsApiKey?: string;
};

const GOOGLE_MAPS_KEY = "google_maps";

export type TelegramConfig = {
  botToken?: string;
  webhookSecret?: string;
  publicBaseUrl?: string;
  leadCompanyId?: string;
  /** AI reply suggestions in inbox. */
  aiEnabled?: boolean;
  aiOpenaiApiKey?: string;
  aiModel?: string;
};

const TELEGRAM_KEY = "telegram_inbox";

// ----- Store (internet shop) config -----

export type StoreTheme = {
  primary?: string;
  primaryHover?: string;
  surface?: string;
  border?: string;
};

export type StoreBanner = {
  id: string;
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
  imageUrl?: string;
  order: number;
};

export type StoreContact = {
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
};

export type StoreConfig = {
  theme?: StoreTheme;
  banners?: StoreBanner[];
  contact?: StoreContact;
};

const STORE_CONFIG_KEY = "store_config";

const DEFAULT_STORE_CONFIG: StoreConfig = {
  theme: {
    primary: "#1e3a5f",
    primaryHover: "#152a47",
    surface: "#f8fafc",
    border: "#e2e8f0",
  },
  banners: [
    {
      id: "b1",
      title: "Титанові платформи",
      subtitle: "Каталог стоматологічних компонентів сумісності. Якість та надійність для професійної практики.",
      ctaText: "Перейти в каталог",
      ctaHref: "#catalog",
      order: 0,
    },
    {
      id: "b2",
      title: "Формувачі ясен",
      subtitle: "від $15",
      ctaText: "Купити",
      ctaHref: "/?search=формувач",
      order: 1,
    },
  ],
  contact: {
    companyName: "SUPREX",
    address: "Дніпро, просп. Б. Хмельницкого 147",
    phone: "+380673597488",
    email: "[email protected]",
  },
};

function mergeStoreConfig(saved: Record<string, unknown> | null): StoreConfig {
  const savedTheme = saved?.theme as Record<string, unknown> | undefined;
  const savedContact = saved?.contact as Record<string, unknown> | undefined;
  const theme: StoreTheme = {
    primary:
      typeof savedTheme?.primary === "string" ? (savedTheme.primary as string) : DEFAULT_STORE_CONFIG.theme?.primary,
    primaryHover:
      typeof savedTheme?.primaryHover === "string"
        ? (savedTheme.primaryHover as string)
        : DEFAULT_STORE_CONFIG.theme?.primaryHover,
    surface:
      typeof savedTheme?.surface === "string" ? (savedTheme.surface as string) : DEFAULT_STORE_CONFIG.theme?.surface,
    border:
      typeof savedTheme?.border === "string" ? (savedTheme.border as string) : DEFAULT_STORE_CONFIG.theme?.border,
  };
  let banners: StoreBanner[] = DEFAULT_STORE_CONFIG.banners ?? [];
  if (Array.isArray(saved?.banners) && saved.banners.length > 0) {
    banners = (saved.banners as unknown[]).filter(
      (b): b is StoreBanner =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as StoreBanner).id === "string" &&
        typeof (b as StoreBanner).title === "string" &&
        typeof (b as StoreBanner).order === "number",
    ).map((b) => ({
      id: (b as StoreBanner).id,
      title: (b as StoreBanner).title,
      subtitle: typeof (b as StoreBanner).subtitle === "string" ? (b as StoreBanner).subtitle : undefined,
      ctaText: typeof (b as StoreBanner).ctaText === "string" ? (b as StoreBanner).ctaText : undefined,
      ctaHref: typeof (b as StoreBanner).ctaHref === "string" ? (b as StoreBanner).ctaHref : undefined,
      imageUrl: typeof (b as StoreBanner).imageUrl === "string" ? (b as StoreBanner).imageUrl : undefined,
      order: (b as StoreBanner).order,
    }));
    banners.sort((a, b) => a.order - b.order);
  }
  const contact: StoreContact = {
    companyName:
      typeof savedContact?.companyName === "string"
        ? (savedContact.companyName as string)
        : DEFAULT_STORE_CONFIG.contact?.companyName,
    address:
      typeof savedContact?.address === "string"
        ? (savedContact.address as string)
        : DEFAULT_STORE_CONFIG.contact?.address,
    phone:
      typeof savedContact?.phone === "string"
        ? (savedContact.phone as string)
        : DEFAULT_STORE_CONFIG.contact?.phone,
    email:
      typeof savedContact?.email === "string"
        ? (savedContact.email as string)
        : DEFAULT_STORE_CONFIG.contact?.email,
  };
  return { theme, banners, contact };
}

export type RingostatConfig = {
  isEnabled?: boolean;
  webhookSecret?: string;
  apiToken?: string;
  projectId?: string;
  useWebhook?: boolean;
  usePolling?: boolean;
  pollingLookbackMinutes?: number;
  extensionsToUserId?: Record<string, string>;
  defaultManagerId?: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
  /** Public URL of backend for webhook (e.g. ngrok). Shown in UI. */
  publicBaseUrl?: string;
};

function maskToken(value: string | undefined): string {
  if (!value || value.length < 8) return value ? "••••" : "";
  return "••••" + value.slice(-4);
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getExchangeRates(): Promise<ExchangeRates> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: EXCHANGE_RATES_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return { ...DEFAULT_RATES };
    }
    const v = row.value as Record<string, unknown>;
    return {
      UAH_TO_USD: typeof v.UAH_TO_USD === "number" ? v.UAH_TO_USD : DEFAULT_RATES.UAH_TO_USD,
      EUR_TO_USD: typeof v.EUR_TO_USD === "number" ? v.EUR_TO_USD : DEFAULT_RATES.EUR_TO_USD,
    };
  }

  async setExchangeRates(rates: Partial<ExchangeRates>): Promise<ExchangeRates> {
    const current = await this.getExchangeRates();
    const next: ExchangeRates = {
      UAH_TO_USD: typeof rates.UAH_TO_USD === "number" ? rates.UAH_TO_USD : current.UAH_TO_USD,
      EUR_TO_USD: typeof rates.EUR_TO_USD === "number" ? rates.EUR_TO_USD : current.EUR_TO_USD,
    };
    await this.prisma.systemSetting.upsert({
      where: { id: EXCHANGE_RATES_KEY },
      create: { id: EXCHANGE_RATES_KEY, value: next },
      update: { value: next },
    });
    return next;
  }

  async getMetaLeadAdsConfig(): Promise<MetaLeadAdsConfig & { pageAccessTokenMasked?: string }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: META_LEAD_ADS_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return {};
    }
    const v = row.value as Record<string, unknown>;
    const webhookVerifyToken = typeof v.webhookVerifyToken === "string" ? v.webhookVerifyToken : undefined;
    const pageAccessToken = typeof v.pageAccessToken === "string" ? v.pageAccessToken : undefined;
    const companyId = typeof v.companyId === "string" ? v.companyId : undefined;
    return {
      webhookVerifyToken: webhookVerifyToken || undefined,
      pageAccessTokenMasked: maskToken(pageAccessToken),
      companyId: companyId || undefined,
    };
  }

  async setMetaLeadAdsConfig(config: Partial<MetaLeadAdsConfig>): Promise<MetaLeadAdsConfig & { pageAccessTokenMasked?: string }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: META_LEAD_ADS_KEY },
    });
    const current = (row?.value as Record<string, unknown>) || {};
    const next: Record<string, unknown> = {
      webhookVerifyToken:
        typeof config.webhookVerifyToken === "string" ? config.webhookVerifyToken : (current.webhookVerifyToken as string) ?? undefined,
      pageAccessToken:
        typeof config.pageAccessToken === "string" ? config.pageAccessToken : (current.pageAccessToken as string) ?? undefined,
      companyId: typeof config.companyId === "string" ? config.companyId : (current.companyId as string) ?? undefined,
    };
    if (config.webhookVerifyToken === "") next.webhookVerifyToken = undefined;
    if (config.pageAccessToken === "") next.pageAccessToken = undefined;
    if (config.companyId === "") next.companyId = undefined;
    await this.prisma.systemSetting.upsert({
      where: { id: META_LEAD_ADS_KEY },
      create: { id: META_LEAD_ADS_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
    const pageAccessToken = next.pageAccessToken as string | undefined;
    return {
      webhookVerifyToken: next.webhookVerifyToken as string | undefined,
      pageAccessTokenMasked: maskToken(pageAccessToken),
      companyId: next.companyId as string | undefined,
    };
  }

  async getGoogleMapsConfig(): Promise<{ mapsApiKeyMasked?: string }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: GOOGLE_MAPS_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return {};
    }
    const v = row.value as Record<string, unknown>;
    const mapsApiKey = typeof v.mapsApiKey === "string" ? v.mapsApiKey : undefined;
    return {
      mapsApiKeyMasked: maskToken(mapsApiKey),
    };
  }

  async setGoogleMapsConfig(config: Partial<GoogleMapsConfig>): Promise<{ mapsApiKeyMasked?: string }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: GOOGLE_MAPS_KEY },
    });
    const current = (row?.value as Record<string, unknown>) || {};
    const next: Record<string, unknown> = {
      mapsApiKey:
        typeof config.mapsApiKey === "string"
          ? config.mapsApiKey
          : (current.mapsApiKey as string | undefined),
    };
    if (config.mapsApiKey === "") {
      next.mapsApiKey = undefined;
    }
    await this.prisma.systemSetting.upsert({
      where: { id: GOOGLE_MAPS_KEY },
      create: { id: GOOGLE_MAPS_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
    const mapsApiKey = next.mapsApiKey as string | undefined;
    return {
      mapsApiKeyMasked: maskToken(mapsApiKey),
    };
  }

  async getGoogleMapsPublicConfig(): Promise<{ mapsApiKey: string | null }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: GOOGLE_MAPS_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return { mapsApiKey: null };
    }
    const v = row.value as Record<string, unknown>;
    const mapsApiKey = typeof v.mapsApiKey === "string" ? v.mapsApiKey : null;
    return { mapsApiKey };
  }

  async getTelegramConfig(): Promise<
    TelegramConfig & {
      botTokenMasked?: string;
      webhookSecretMasked?: string;
      aiOpenaiApiKeyMasked?: string;
    }
  > {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: TELEGRAM_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return {};
    }
    const v = row.value as Record<string, unknown>;
    const botToken = typeof v.botToken === "string" ? v.botToken : undefined;
    const webhookSecret = typeof v.webhookSecret === "string" ? v.webhookSecret : undefined;
    const publicBaseUrl = typeof v.publicBaseUrl === "string" ? v.publicBaseUrl : undefined;
    const leadCompanyId = typeof v.leadCompanyId === "string" ? v.leadCompanyId : undefined;
    const aiOpenaiApiKey = typeof v.aiOpenaiApiKey === "string" ? v.aiOpenaiApiKey : undefined;
    return {
      botTokenMasked: maskToken(botToken),
      webhookSecretMasked: maskToken(webhookSecret),
      publicBaseUrl: publicBaseUrl || undefined,
      leadCompanyId: leadCompanyId || undefined,
      aiEnabled: typeof v.aiEnabled === "boolean" ? v.aiEnabled : undefined,
      aiOpenaiApiKeyMasked: maskToken(aiOpenaiApiKey),
      aiModel: typeof v.aiModel === "string" ? v.aiModel : undefined,
    };
  }

  async setTelegramConfig(
    config: Partial<TelegramConfig>,
  ): Promise<
    TelegramConfig & {
      botTokenMasked?: string;
      webhookSecretMasked?: string;
      aiOpenaiApiKeyMasked?: string;
    }
  > {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: TELEGRAM_KEY },
    });
    const current = (row?.value as Record<string, unknown>) || {};
    const next: Record<string, unknown> = {
      botToken:
        typeof config.botToken === "string" ? config.botToken : (current.botToken as string) ?? undefined,
      webhookSecret:
        typeof config.webhookSecret === "string"
          ? config.webhookSecret
          : (current.webhookSecret as string) ?? undefined,
      publicBaseUrl:
        typeof config.publicBaseUrl === "string"
          ? config.publicBaseUrl
          : (current.publicBaseUrl as string) ?? undefined,
      leadCompanyId:
        typeof config.leadCompanyId === "string"
          ? config.leadCompanyId
          : (current.leadCompanyId as string) ?? undefined,
      aiEnabled:
        typeof config.aiEnabled === "boolean" ? config.aiEnabled : (current.aiEnabled as boolean) ?? undefined,
      aiOpenaiApiKey:
        typeof config.aiOpenaiApiKey === "string"
          ? config.aiOpenaiApiKey
          : (current.aiOpenaiApiKey as string) ?? undefined,
      aiModel:
        typeof config.aiModel === "string" ? config.aiModel : (current.aiModel as string) ?? undefined,
    };
    if (config.botToken === "") next.botToken = undefined;
    if (config.webhookSecret === "") next.webhookSecret = undefined;
    if (config.publicBaseUrl === "") next.publicBaseUrl = undefined;
    if (config.leadCompanyId === "") next.leadCompanyId = undefined;
    if (config.aiOpenaiApiKey === "") next.aiOpenaiApiKey = undefined;
    if (config.aiModel === "") next.aiModel = undefined;
    await this.prisma.systemSetting.upsert({
      where: { id: TELEGRAM_KEY },
      create: { id: TELEGRAM_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
    const botToken = next.botToken as string | undefined;
    const webhookSecret = next.webhookSecret as string | undefined;
    return {
      botTokenMasked: maskToken(botToken),
      webhookSecretMasked: maskToken(webhookSecret),
      publicBaseUrl: next.publicBaseUrl as string | undefined,
      leadCompanyId: next.leadCompanyId as string | undefined,
      aiEnabled: next.aiEnabled as boolean | undefined,
      aiOpenaiApiKeyMasked: maskToken(next.aiOpenaiApiKey as string | undefined),
      aiModel: next.aiModel as string | undefined,
    };
  }

  /** Returns raw bot token and webhook secret for internal use (e.g. Telegram module). */
  async getTelegramSecrets(): Promise<{
    botToken: string | null;
    webhookSecret: string | null;
    publicBaseUrl: string | null;
    leadCompanyId: string | null;
  }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: TELEGRAM_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return {
        botToken: null,
        webhookSecret: null,
        publicBaseUrl: null,
        leadCompanyId: null,
      };
    }
    const v = row.value as Record<string, unknown>;
    return {
      botToken: typeof v.botToken === "string" ? v.botToken : null,
      webhookSecret: typeof v.webhookSecret === "string" ? v.webhookSecret : null,
      publicBaseUrl: typeof v.publicBaseUrl === "string" ? v.publicBaseUrl : null,
      leadCompanyId: typeof v.leadCompanyId === "string" ? v.leadCompanyId : null,
    };
  }

  /** Returns AI config for Telegram inbox suggestions (internal use). */
  async getTelegramAiConfig(): Promise<{
    enabled: boolean;
    openaiApiKey: string | null;
    model: string;
  }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: TELEGRAM_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return { enabled: false, openaiApiKey: null, model: "gpt-4o-mini" };
    }
    const v = row.value as Record<string, unknown>;
    const enabled = v.aiEnabled === true;
    const openaiApiKey =
      typeof v.aiOpenaiApiKey === "string" && v.aiOpenaiApiKey
        ? v.aiOpenaiApiKey
        : (process.env.OPENAI_API_KEY as string) || null;
    const model = typeof v.aiModel === "string" && v.aiModel ? v.aiModel : "gpt-4o-mini";
    return { enabled, openaiApiKey, model };
  }

  async getRingostatConfig(): Promise<
    RingostatConfig & { webhookSecretMasked?: string; apiTokenMasked?: string }
  > {
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: RINGOSTAT_PROVIDER },
    });
    if (!row) {
      return {
        isEnabled: false,
        useWebhook: true,
        usePolling: false,
        pollingLookbackMinutes: 10,
        extensionsToUserId: {},
        webhookSecretMasked: "",
        apiTokenMasked: "",
      };
    }

    const cfg = (row.config ?? {}) as RingostatConfig;

    return {
      isEnabled: row.isEnabled,
      useWebhook: cfg.useWebhook ?? true,
      usePolling: cfg.usePolling ?? false,
      pollingLookbackMinutes: cfg.pollingLookbackMinutes ?? 10,
      extensionsToUserId: cfg.extensionsToUserId ?? {},
      defaultManagerId: cfg.defaultManagerId,
      projectId: cfg.projectId,
      apiBaseUrl: cfg.apiBaseUrl,
      pollingEndpoint: cfg.pollingEndpoint,
      publicBaseUrl: cfg.publicBaseUrl,
      webhookSecretMasked: maskToken(row.webhookSecret ?? undefined),
      apiTokenMasked: maskToken(row.apiToken ?? undefined),
    };
  }

  async setRingostatConfig(
    body: Partial<RingostatConfig>,
  ): Promise<RingostatConfig & { webhookSecretMasked?: string; apiTokenMasked?: string }> {
    const existing = await this.prisma.integrationSetting.findFirst({
      where: { provider: RINGOSTAT_PROVIDER },
    });

    const currentConfig = (existing?.config ?? {}) as RingostatConfig;
    const nextConfig: RingostatConfig = {
      useWebhook:
        typeof body.useWebhook === "boolean" ? body.useWebhook : currentConfig.useWebhook ?? true,
      usePolling:
        typeof body.usePolling === "boolean" ? body.usePolling : currentConfig.usePolling ?? false,
      pollingLookbackMinutes:
        typeof body.pollingLookbackMinutes === "number"
          ? body.pollingLookbackMinutes
          : currentConfig.pollingLookbackMinutes ?? 10,
      extensionsToUserId:
        typeof body.extensionsToUserId === "object" && body.extensionsToUserId
          ? body.extensionsToUserId
          : currentConfig.extensionsToUserId ?? {},
      defaultManagerId:
        body.defaultManagerId !== undefined
          ? body.defaultManagerId || undefined
          : currentConfig.defaultManagerId,
      projectId:
        typeof body.projectId === "string"
          ? body.projectId.trim() || undefined
          : currentConfig.projectId ?? undefined,
      apiBaseUrl:
        typeof body.apiBaseUrl === "string"
          ? body.apiBaseUrl
          : currentConfig.apiBaseUrl ?? undefined,
      pollingEndpoint:
        typeof body.pollingEndpoint === "string"
          ? body.pollingEndpoint
          : currentConfig.pollingEndpoint ?? undefined,
      publicBaseUrl:
        typeof body.publicBaseUrl === "string"
          ? body.publicBaseUrl.trim() || undefined
          : currentConfig.publicBaseUrl ?? undefined,
    };

    const isEnabled =
      typeof body.isEnabled === "boolean"
        ? body.isEnabled
        : existing?.isEnabled ?? false;

    let webhookSecret =
      typeof body.webhookSecret === "string"
        ? body.webhookSecret
        : existing?.webhookSecret ?? null;
    if (body.webhookSecret === "") webhookSecret = null;

    let apiToken =
      typeof body.apiToken === "string" ? body.apiToken : existing?.apiToken ?? null;
    if (body.apiToken === "") apiToken = null;

    const row = await this.prisma.integrationSetting.upsert({
      where: existing ? { id: existing.id } : { id: "ringostat_default" },
      create: {
        id: existing?.id ?? "ringostat_default",
        provider: RINGOSTAT_PROVIDER,
        isEnabled,
        webhookSecret,
        apiToken,
        config: nextConfig as Prisma.InputJsonValue,
      },
      update: {
        isEnabled,
        webhookSecret,
        apiToken,
        config: nextConfig as Prisma.InputJsonValue,
      },
    });

    return {
      isEnabled: row.isEnabled,
      useWebhook: nextConfig.useWebhook,
      usePolling: nextConfig.usePolling,
      pollingLookbackMinutes: nextConfig.pollingLookbackMinutes,
      extensionsToUserId: nextConfig.extensionsToUserId,
      defaultManagerId: nextConfig.defaultManagerId,
      projectId: nextConfig.projectId,
      apiBaseUrl: nextConfig.apiBaseUrl,
      pollingEndpoint: nextConfig.pollingEndpoint,
      publicBaseUrl: nextConfig.publicBaseUrl,
      webhookSecretMasked: maskToken(row.webhookSecret ?? undefined),
      apiTokenMasked: maskToken(row.apiToken ?? undefined),
    };
  }

  async getStoreConfig(): Promise<StoreConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: STORE_CONFIG_KEY },
    });
    const saved = row?.value && typeof row.value === "object" ? (row.value as Record<string, unknown>) : null;
    return mergeStoreConfig(saved);
  }

  /** Public API for store frontend (no auth). */
  async getStoreConfigPublic(): Promise<StoreConfig> {
    return this.getStoreConfig();
  }

  async setStoreConfig(body: Partial<StoreConfig>): Promise<StoreConfig> {
    const current = await this.getStoreConfig();
    const nextTheme: StoreTheme = {
      primary: typeof body.theme?.primary === "string" ? body.theme.primary : current.theme?.primary,
      primaryHover:
        typeof body.theme?.primaryHover === "string" ? body.theme.primaryHover : current.theme?.primaryHover,
      surface: typeof body.theme?.surface === "string" ? body.theme.surface : current.theme?.surface,
      border: typeof body.theme?.border === "string" ? body.theme.border : current.theme?.border,
    };
    const nextBanners =
      body.banners !== undefined
        ? Array.isArray(body.banners)
          ? body.banners
              .filter(
                (b): b is StoreBanner =>
                  b && typeof b.id === "string" && typeof b.title === "string" && typeof b.order === "number",
              )
              .map((b) => ({
                id: b.id,
                title: b.title,
                subtitle: typeof b.subtitle === "string" ? b.subtitle : undefined,
                ctaText: typeof b.ctaText === "string" ? b.ctaText : undefined,
                ctaHref: typeof b.ctaHref === "string" ? b.ctaHref : undefined,
                imageUrl: typeof b.imageUrl === "string" ? b.imageUrl : undefined,
                order: b.order,
              }))
              .sort((a, b) => a.order - b.order)
          : current.banners ?? []
        : current.banners ?? [];
    const nextContact: StoreContact = {
      companyName:
        typeof body.contact?.companyName === "string" ? body.contact.companyName : current.contact?.companyName,
      address: typeof body.contact?.address === "string" ? body.contact.address : current.contact?.address,
      phone: typeof body.contact?.phone === "string" ? body.contact.phone : current.contact?.phone,
      email: typeof body.contact?.email === "string" ? body.contact.email : current.contact?.email,
    };
    const next: StoreConfig = { theme: nextTheme, banners: nextBanners, contact: nextContact };
    await this.prisma.systemSetting.upsert({
      where: { id: STORE_CONFIG_KEY },
      create: { id: STORE_CONFIG_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
    return next;
  }
}
