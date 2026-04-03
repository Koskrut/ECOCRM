import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UKRAINE_REGIONS } from "../store/checkout/uk-regions";
import {
  allocateManagerSlotForLeadRoot,
  canonicalizeRegionName,
  desiredLeadUserIdForOrgSlot,
  leadRootSlotForLeadUser,
} from "./org-chart-region-resolver";
import { RINGOSTAT_PROVIDER } from "../integrations/ringostat/ringostat-ingest.service";
import { OUTBOUND_VOICE_PROVIDER } from "../outbound/outbound.constants";

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
  /** Meta (Facebook) Pixel ID — digits only, for site analytics. */
  fbPixelId?: string;
};

const META_LEAD_ADS_KEY = "meta_lead_ads";

export type GoogleMapsConfig = {
  mapsApiKey?: string;
};

const GOOGLE_MAPS_KEY = "google_maps";

export type GoogleSheetConfig = {
  webhookUrl?: string;
  webhookSecretOut?: string;
  webhookSecretIn?: string;
  /** Відправляти в таблицю при переході в статус READY_TO_SHIP. */
  sendOnReadyToShip?: boolean;
};

const GOOGLE_SHEET_KEY = "google_sheet";

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

export type StoreAnalytics = {
  gaId?: string;
  gtmId?: string;
  metaPixelId?: string;
};

export type StoreConfig = {
  theme?: StoreTheme;
  banners?: StoreBanner[];
  contact?: StoreContact;
  analytics?: StoreAnalytics;
  /** Базовий URL CRM (apps/web), де відкривається /pay/[token]. Без завершального слеша. */
  crmPayPageUrl?: string;
  /** Публічна URL вітрини (apps/store) для посилань з CRM, напр. встановлення пароля. Без завершального слеша. */
  publicStoreUrl?: string;
};

const STORE_CONFIG_KEY = "store_config";
const ORG_CHART_STRUCTURE_KEY = "org_chart_structure";

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
  const savedAnalytics = saved?.analytics as Record<string, unknown> | undefined;
  const analytics: StoreAnalytics = {
    gaId: typeof savedAnalytics?.gaId === "string" ? savedAnalytics.gaId.trim() || undefined : undefined,
    gtmId: typeof savedAnalytics?.gtmId === "string" ? savedAnalytics.gtmId.trim() || undefined : undefined,
    metaPixelId:
      typeof savedAnalytics?.metaPixelId === "string"
        ? savedAnalytics.metaPixelId.trim() || undefined
        : undefined,
  };
  let crmPayPageUrl: string | undefined;
  if (typeof saved?.crmPayPageUrl === "string") {
    const t = saved.crmPayPageUrl.trim().replace(/\/+$/, "");
    if (t) crmPayPageUrl = t;
  }
  let publicStoreUrl: string | undefined;
  if (typeof saved?.publicStoreUrl === "string") {
    const t = saved.publicStoreUrl.trim().replace(/\/+$/, "");
    if (t) publicStoreUrl = t;
  }
  return {
    theme,
    banners,
    contact,
    analytics,
    ...(crmPayPageUrl ? { crmPayPageUrl } : {}),
    ...(publicStoreUrl ? { publicStoreUrl } : {}),
  };
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
  /** Comma-separated /calls/list `fields` override (Ringostat export). Empty = server default. */
  callsListFields?: string;
  /** Public URL of backend for webhook (e.g. ngrok). Shown in UI. */
  publicBaseUrl?: string;
};

export type OutboundVoiceRuntimeMode = "stub" | "generic_http" | "kyivstar_openai_gateway";

/** Outbound AI voice webhook + optional provider API (IntegrationSetting row). */
export type OutboundVoiceIntegrationConfig = {
  apiBaseUrl?: string;
  providerDisplayName?: string;
  /** Appended to apiBaseUrl for create-call POST (default "/calls"). */
  createCallPath?: string;
  /** Top-level JSON keys to read provider session id from create-call response (defaults in runtime secrets). */
  responseSessionIdKeys?: string[];
  /** Explicit runtime; if omitted, legacy rule applies (URL+token → generic HTTP, else stub). */
  runtimeMode?: OutboundVoiceRuntimeMode;
  /** Kyivstar/OpenAI gateway create-call path (default "/v1/outbound/calls"). */
  gatewayCreateCallPath?: string;
  /** Public base URL of CRM API for gateway callbacks (e.g. https://crm.example.com). */
  publicWebhookBaseUrl?: string;
  requestTimeoutMs?: number;
  retryMax?: number;
  transferDefaults?: Record<string, unknown>;
  catalogDefaults?: Record<string, unknown>;
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
    const fbPixelId = typeof v.fbPixelId === "string" ? v.fbPixelId.trim() : undefined;
    return {
      webhookVerifyToken: webhookVerifyToken || undefined,
      pageAccessTokenMasked: maskToken(pageAccessToken),
      companyId: companyId || undefined,
      fbPixelId: fbPixelId || undefined,
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
      fbPixelId: typeof config.fbPixelId === "string" ? config.fbPixelId.trim() : (current.fbPixelId as string) ?? undefined,
    };
    if (config.webhookVerifyToken === "") next.webhookVerifyToken = undefined;
    if (config.pageAccessToken === "") next.pageAccessToken = undefined;
    if (config.companyId === "") next.companyId = undefined;
    if (config.fbPixelId === "") next.fbPixelId = undefined;
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
      fbPixelId: (next.fbPixelId as string | undefined) || undefined,
    };
  }

  /**
   * Public pixel id for embedding in the web app (no auth).
   * DB value wins; optional fallback `FB_PIXEL_ID` on the API server.
   */
  async getMetaLeadAdsPublicConfig(): Promise<{ fbPixelId: string | null }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: META_LEAD_ADS_KEY },
    });
    let fromDb = "";
    if (row?.value && typeof row.value === "object") {
      const v = row.value as Record<string, unknown>;
      fromDb = typeof v.fbPixelId === "string" ? v.fbPixelId.trim() : "";
    }
    const fromEnv = process.env.FB_PIXEL_ID?.trim() ?? "";
    const raw = fromDb || fromEnv;
    if (!raw) return { fbPixelId: null };
    if (!/^\d+$/.test(raw)) return { fbPixelId: null };
    return { fbPixelId: raw };
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

  async getGoogleSheetConfig(): Promise<
    GoogleSheetConfig & { webhookSecretOutMasked?: string; webhookSecretInMasked?: string }
  > {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: GOOGLE_SHEET_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return {
        webhookSecretOutMasked: "",
        webhookSecretInMasked: "",
        sendOnReadyToShip: true,
      };
    }
    const v = row.value as Record<string, unknown>;
    const webhookUrl = typeof v.webhookUrl === "string" ? v.webhookUrl : undefined;
    const webhookSecretOut = typeof v.webhookSecretOut === "string" ? v.webhookSecretOut : undefined;
    const webhookSecretIn = typeof v.webhookSecretIn === "string" ? v.webhookSecretIn : undefined;
    const sendOnReadyToShip = v.sendOnReadyToShip !== false;
    return {
      webhookUrl: webhookUrl || undefined,
      webhookSecretOutMasked: maskToken(webhookSecretOut),
      webhookSecretInMasked: maskToken(webhookSecretIn),
      sendOnReadyToShip,
    };
  }

  async setGoogleSheetConfig(
    config: Partial<GoogleSheetConfig>,
  ): Promise<GoogleSheetConfig & { webhookSecretOutMasked?: string; webhookSecretInMasked?: string }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: GOOGLE_SHEET_KEY },
    });
    const current = (row?.value as Record<string, unknown>) || {};
    const next: Record<string, unknown> = {
      webhookUrl:
        typeof config.webhookUrl === "string"
          ? config.webhookUrl
          : (current.webhookUrl as string | undefined),
      webhookSecretOut:
        config.webhookSecretOut !== undefined
          ? (config.webhookSecretOut || undefined)
          : (current.webhookSecretOut as string | undefined),
      webhookSecretIn:
        config.webhookSecretIn !== undefined
          ? (config.webhookSecretIn || undefined)
          : (current.webhookSecretIn as string | undefined),
      sendOnReadyToShip: config.sendOnReadyToShip !== undefined ? config.sendOnReadyToShip : current.sendOnReadyToShip !== false,
    };
    if (config.webhookUrl === "") next.webhookUrl = undefined;
    if (config.webhookSecretOut === "") next.webhookSecretOut = undefined;
    if (config.webhookSecretIn === "") next.webhookSecretIn = undefined;
    await this.prisma.systemSetting.upsert({
      where: { id: GOOGLE_SHEET_KEY },
      create: { id: GOOGLE_SHEET_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
    const webhookSecretOut = next.webhookSecretOut as string | undefined;
    const webhookSecretIn = next.webhookSecretIn as string | undefined;
    return {
      webhookUrl: next.webhookUrl as string | undefined,
      webhookSecretOutMasked: maskToken(webhookSecretOut),
      webhookSecretInMasked: maskToken(webhookSecretIn),
      sendOnReadyToShip: next.sendOnReadyToShip as boolean,
    };
  }

  /** Raw values for internal use (outgoing service, incoming webhook). */
  async getGoogleSheetSecrets(): Promise<{
    webhookUrl: string | null;
    webhookSecretOut: string | null;
    webhookSecretIn: string | null;
    sendOnReadyToShip: boolean;
  }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: GOOGLE_SHEET_KEY },
    });
    if (!row || !row.value || typeof row.value !== "object") {
      return {
        webhookUrl: null,
        webhookSecretOut: null,
        webhookSecretIn: null,
        sendOnReadyToShip: true,
      };
    }
    const v = row.value as Record<string, unknown>;
    return {
      webhookUrl: typeof v.webhookUrl === "string" ? v.webhookUrl : null,
      webhookSecretOut: typeof v.webhookSecretOut === "string" ? v.webhookSecretOut : null,
      webhookSecretIn: typeof v.webhookSecretIn === "string" ? v.webhookSecretIn : null,
      sendOnReadyToShip: v.sendOnReadyToShip !== false,
    };
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
      callsListFields: cfg.callsListFields,
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
      callsListFields:
        typeof body.callsListFields === "string"
          ? body.callsListFields.trim() || undefined
          : currentConfig.callsListFields ?? undefined,
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
      callsListFields: nextConfig.callsListFields,
      publicBaseUrl: nextConfig.publicBaseUrl,
      webhookSecretMasked: maskToken(row.webhookSecret ?? undefined),
      apiTokenMasked: maskToken(row.apiToken ?? undefined),
    };
  }

  async getOutboundVoiceIntegrationConfig(): Promise<
    OutboundVoiceIntegrationConfig & {
      isEnabled: boolean;
      webhookSecretMasked?: string;
      apiTokenMasked?: string;
    }
  > {
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: OUTBOUND_VOICE_PROVIDER },
    });
    if (!row) {
      return {
        isEnabled: false,
        webhookSecretMasked: "",
        apiTokenMasked: "",
        runtimeMode: undefined,
        gatewayCreateCallPath: undefined,
        publicWebhookBaseUrl: undefined,
        requestTimeoutMs: undefined,
        retryMax: undefined,
        transferDefaults: undefined,
        catalogDefaults: undefined,
      };
    }
    const cfg = (row.config ?? {}) as OutboundVoiceIntegrationConfig;
    return {
      isEnabled: row.isEnabled,
      apiBaseUrl: cfg.apiBaseUrl,
      providerDisplayName: cfg.providerDisplayName,
      createCallPath: cfg.createCallPath,
      responseSessionIdKeys: cfg.responseSessionIdKeys,
      runtimeMode: cfg.runtimeMode,
      gatewayCreateCallPath: cfg.gatewayCreateCallPath,
      publicWebhookBaseUrl: cfg.publicWebhookBaseUrl,
      requestTimeoutMs: cfg.requestTimeoutMs,
      retryMax: cfg.retryMax,
      transferDefaults: cfg.transferDefaults,
      catalogDefaults: cfg.catalogDefaults,
      webhookSecretMasked: maskToken(row.webhookSecret ?? undefined),
      apiTokenMasked: maskToken(row.apiToken ?? undefined),
    };
  }

  /** Raw server-side credentials for outbound voice HTTP adapter (not for browser). */
  async getOutboundVoiceRuntimeSecrets(): Promise<{
    runtimeMode: OutboundVoiceRuntimeMode | null;
    apiBaseUrl: string | null;
    apiToken: string | null;
    createCallPath: string;
    gatewayCreateCallPath: string;
    responseSessionIdKeys: string[];
    publicWebhookBaseUrl: string | null;
    requestTimeoutMs: number;
    retryMax: number;
  }> {
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: OUTBOUND_VOICE_PROVIDER },
    });
    const cfg = (row?.config ?? {}) as OutboundVoiceIntegrationConfig;
    const keys = Array.isArray(cfg.responseSessionIdKeys)
      ? cfg.responseSessionIdKeys.filter((x): x is string => typeof x === "string")
      : [];
    const pathRaw = typeof cfg.createCallPath === "string" ? cfg.createCallPath.trim() : "";
    const gwPathRaw = typeof cfg.gatewayCreateCallPath === "string" ? cfg.gatewayCreateCallPath.trim() : "";
    const envPublic = process.env.OUTBOUND_VOICE_PUBLIC_BASE_URL?.trim();
    const cfgPublic =
      typeof cfg.publicWebhookBaseUrl === "string" && cfg.publicWebhookBaseUrl.trim()
        ? cfg.publicWebhookBaseUrl.trim()
        : null;
    const publicWebhookBaseUrl = envPublic || cfgPublic || null;
    const mode =
      cfg.runtimeMode === "stub" ||
      cfg.runtimeMode === "generic_http" ||
      cfg.runtimeMode === "kyivstar_openai_gateway"
        ? cfg.runtimeMode
        : null;
    return {
      runtimeMode: mode,
      apiBaseUrl: typeof cfg.apiBaseUrl === "string" && cfg.apiBaseUrl.trim() ? cfg.apiBaseUrl.trim() : null,
      apiToken: row?.apiToken && String(row.apiToken).trim() ? String(row.apiToken).trim() : null,
      createCallPath: pathRaw || "/calls",
      gatewayCreateCallPath: gwPathRaw || "/v1/outbound/calls",
      responseSessionIdKeys:
        keys.length > 0 ? keys : ["id", "call_id", "session_id", "providerSessionId"],
      publicWebhookBaseUrl,
      requestTimeoutMs:
        typeof cfg.requestTimeoutMs === "number" && cfg.requestTimeoutMs > 0 ? cfg.requestTimeoutMs : 30_000,
      retryMax: typeof cfg.retryMax === "number" && cfg.retryMax >= 0 ? cfg.retryMax : 0,
    };
  }

  async setOutboundVoiceIntegrationConfig(
    body: Partial<OutboundVoiceIntegrationConfig> & {
      isEnabled?: boolean;
      webhookSecret?: string;
      apiToken?: string;
      /** Pass null to clear explicit runtime mode (restore legacy URL heuristic). */
      runtimeMode?: OutboundVoiceRuntimeMode | null;
    },
  ): Promise<
    OutboundVoiceIntegrationConfig & {
      isEnabled: boolean;
      webhookSecretMasked?: string;
      apiTokenMasked?: string;
    }
  > {
    const existing = await this.prisma.integrationSetting.findFirst({
      where: { provider: OUTBOUND_VOICE_PROVIDER },
    });
    const currentCfg = (existing?.config ?? {}) as OutboundVoiceIntegrationConfig;
    const nextCfg: OutboundVoiceIntegrationConfig = {
      apiBaseUrl:
        typeof body.apiBaseUrl === "string"
          ? body.apiBaseUrl.trim() || undefined
          : currentCfg.apiBaseUrl,
      providerDisplayName:
        typeof body.providerDisplayName === "string"
          ? body.providerDisplayName.trim() || undefined
          : currentCfg.providerDisplayName,
      createCallPath:
        typeof body.createCallPath === "string"
          ? body.createCallPath.trim() || undefined
          : currentCfg.createCallPath,
      responseSessionIdKeys: Array.isArray(body.responseSessionIdKeys)
        ? body.responseSessionIdKeys.filter((x): x is string => typeof x === "string")
        : currentCfg.responseSessionIdKeys,
      runtimeMode:
        body.runtimeMode === "stub" ||
        body.runtimeMode === "generic_http" ||
        body.runtimeMode === "kyivstar_openai_gateway"
          ? body.runtimeMode
          : body.runtimeMode === null
            ? undefined
            : currentCfg.runtimeMode,
      gatewayCreateCallPath:
        typeof body.gatewayCreateCallPath === "string"
          ? body.gatewayCreateCallPath.trim() || undefined
          : currentCfg.gatewayCreateCallPath,
      publicWebhookBaseUrl:
        typeof body.publicWebhookBaseUrl === "string"
          ? body.publicWebhookBaseUrl.trim() || undefined
          : currentCfg.publicWebhookBaseUrl,
      requestTimeoutMs:
        typeof body.requestTimeoutMs === "number" ? body.requestTimeoutMs : currentCfg.requestTimeoutMs,
      retryMax: typeof body.retryMax === "number" ? body.retryMax : currentCfg.retryMax,
      transferDefaults:
        body.transferDefaults !== undefined ? body.transferDefaults : currentCfg.transferDefaults,
      catalogDefaults:
        body.catalogDefaults !== undefined ? body.catalogDefaults : currentCfg.catalogDefaults,
    };
    if (body.apiBaseUrl === "") nextCfg.apiBaseUrl = undefined;
    if (body.providerDisplayName === "") nextCfg.providerDisplayName = undefined;
    if (body.createCallPath === "") nextCfg.createCallPath = undefined;
    if (body.gatewayCreateCallPath === "") nextCfg.gatewayCreateCallPath = undefined;
    if (body.publicWebhookBaseUrl === "") nextCfg.publicWebhookBaseUrl = undefined;

    const isEnabled =
      typeof body.isEnabled === "boolean" ? body.isEnabled : (existing?.isEnabled ?? false);

    let webhookSecret =
      typeof body.webhookSecret === "string"
        ? body.webhookSecret
        : existing?.webhookSecret ?? null;
    if (body.webhookSecret === "") webhookSecret = null;

    let apiToken =
      typeof body.apiToken === "string" ? body.apiToken : existing?.apiToken ?? null;
    if (body.apiToken === "") apiToken = null;

    const row = await this.prisma.integrationSetting.upsert({
      where: existing ? { id: existing.id } : { id: "outbound_voice_default" },
      create: {
        id: existing?.id ?? "outbound_voice_default",
        provider: OUTBOUND_VOICE_PROVIDER,
        isEnabled,
        webhookSecret,
        apiToken,
        config: nextCfg as Prisma.InputJsonValue,
      },
      update: {
        isEnabled,
        webhookSecret,
        apiToken,
        config: nextCfg as Prisma.InputJsonValue,
      },
    });

    return {
      isEnabled: row.isEnabled,
      apiBaseUrl: nextCfg.apiBaseUrl,
      providerDisplayName: nextCfg.providerDisplayName,
      createCallPath: nextCfg.createCallPath,
      responseSessionIdKeys: nextCfg.responseSessionIdKeys,
      runtimeMode: nextCfg.runtimeMode,
      gatewayCreateCallPath: nextCfg.gatewayCreateCallPath,
      publicWebhookBaseUrl: nextCfg.publicWebhookBaseUrl,
      requestTimeoutMs: nextCfg.requestTimeoutMs,
      retryMax: nextCfg.retryMax,
      transferDefaults: nextCfg.transferDefaults,
      catalogDefaults: nextCfg.catalogDefaults,
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
    const nextAnalytics: StoreAnalytics = {
      gaId:
        typeof body.analytics?.gaId === "string"
          ? body.analytics.gaId.trim() || undefined
          : current.analytics?.gaId,
      gtmId:
        typeof body.analytics?.gtmId === "string"
          ? body.analytics.gtmId.trim() || undefined
          : current.analytics?.gtmId,
      metaPixelId:
        typeof body.analytics?.metaPixelId === "string"
          ? body.analytics.metaPixelId.trim() || undefined
          : current.analytics?.metaPixelId,
    };
    const nextCrmPayPageUrl =
      "crmPayPageUrl" in body && typeof body.crmPayPageUrl === "string"
        ? body.crmPayPageUrl.trim().replace(/\/+$/, "") || undefined
        : current.crmPayPageUrl;
    const nextPublicStoreUrl =
      "publicStoreUrl" in body && typeof body.publicStoreUrl === "string"
        ? body.publicStoreUrl.trim().replace(/\/+$/, "") || undefined
        : current.publicStoreUrl;
    const next: StoreConfig = {
      theme: nextTheme,
      banners: nextBanners,
      contact: nextContact,
      analytics: nextAnalytics,
      ...(nextCrmPayPageUrl ? { crmPayPageUrl: nextCrmPayPageUrl } : {}),
      ...(nextPublicStoreUrl ? { publicStoreUrl: nextPublicStoreUrl } : {}),
    };
    await this.prisma.systemSetting.upsert({
      where: { id: STORE_CONFIG_KEY },
      create: { id: STORE_CONFIG_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
    return next;
  }

  /** Структура отдела: назначения, доп. слоты, области. */
  async getOrgChartStructure(): Promise<{
    assignments: Record<string, string | null>;
    extraSlots: string[];
    regions: Record<string, string[]>;
  }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: ORG_CHART_STRUCTURE_KEY },
    });
    const v = row?.value && typeof row.value === "object" ? (row.value as Record<string, unknown>) : null;
    return {
      assignments: (v?.assignments && typeof v.assignments === "object" ? v.assignments : {}) as Record<
        string,
        string | null
      >,
      extraSlots: Array.isArray(v?.extraSlots) ? (v.extraSlots as string[]) : [],
      regions: (v?.regions && typeof v.regions === "object" ? v.regions : {}) as Record<string, string[]>,
    };
  }

  async setOrgChartStructure(body: {
    assignments?: Record<string, string | null>;
    extraSlots?: string[];
    regions?: Record<string, string[]>;
  }): Promise<{ assignments: Record<string, string | null>; extraSlots: string[]; regions: Record<string, string[]> }> {
    const current = await this.getOrgChartStructure();
    const next = {
      assignments: body.assignments ?? current.assignments,
      extraSlots: Array.isArray(body.extraSlots) ? body.extraSlots : current.extraSlots,
      regions: body.regions ?? current.regions,
    };
    return this.persistOrgChartWithLeadSync(current, next);
  }

  /**
   * Оновлює org-chart, коли в профілі змінили керівника (PATCH user.leadId).
   * Переносить користувача в перший вільний m1-* / m2-* під відповідний lead1/lead2.
   */
  async syncOrgChartForUserLeadChange(userId: string, leadId: string | null): Promise<void> {
    const current = await this.getOrgChartStructure();
    const assignments: Record<string, string | null> = { ...current.assignments };
    let extraSlots = [...current.extraSlots];

    for (const key of Object.keys(assignments)) {
      const v = assignments[key];
      if (v != null && String(v).trim() === userId) {
        assignments[key] = null;
      }
    }

    if (leadId != null && leadId.trim() !== "") {
      const root = leadRootSlotForLeadUser(assignments, leadId);
      if (!root) {
        throw new BadRequestException(
          "Керівник має бути призначений у слотах lead1 або lead2 на оргструктурі. Спочатку відкрийте «Структура» або збережіть її з цим керівником у lead1/lead2.",
        );
      }
      const { slotId, extraSlots: nextExtra } = allocateManagerSlotForLeadRoot(root, extraSlots, assignments);
      extraSlots = nextExtra;
      assignments[slotId] = userId;
    }

    const next = {
      assignments,
      extraSlots,
      regions: current.regions,
    };
    await this.persistOrgChartWithLeadSync(current, next);
  }

  /** Прибрати користувача з усіх слотів (перед видаленням акаунта). */
  async syncOrgChartRemoveUserFromAllSlots(userId: string): Promise<void> {
    const current = await this.getOrgChartStructure();
    const assignments: Record<string, string | null> = { ...current.assignments };
    let changed = false;
    for (const key of Object.keys(assignments)) {
      const v = assignments[key];
      if (v != null && String(v).trim() === userId) {
        assignments[key] = null;
        changed = true;
      }
    }
    if (!changed) return;
    const next = {
      assignments,
      extraSlots: current.extraSlots,
      regions: current.regions,
    };
    await this.persistOrgChartWithLeadSync(current, next);
  }

  /** Якщо роль більше не LEAD/ADMIN — прибрати зі слотів lead1/lead2 у структурі. */
  async syncOrgChartClearLeadSlotIfDemoted(userId: string, newRole: UserRole): Promise<void> {
    if (newRole === UserRole.LEAD || newRole === UserRole.ADMIN) return;
    const current = await this.getOrgChartStructure();
    const assignments: Record<string, string | null> = { ...current.assignments };
    let changed = false;
    for (const slot of ["lead1", "lead2"] as const) {
      const v = assignments[slot];
      if (v != null && String(v).trim() === userId) {
        assignments[slot] = null;
        changed = true;
      }
    }
    if (!changed) return;
    const next = {
      assignments,
      extraSlots: current.extraSlots,
      regions: current.regions,
    };
    await this.persistOrgChartWithLeadSync(current, next);
  }

  private collectAssignmentUserIds(rec: Record<string, string | null>) {
    const s = new Set<string>();
    for (const v of Object.values(rec)) {
      if (v == null || v === "") continue;
      const t = String(v).trim();
      if (t) s.add(t);
    }
    return s;
  }

  private async persistOrgChartWithLeadSync(
    current: {
      assignments: Record<string, string | null>;
      extraSlots: string[];
      regions: Record<string, string[]>;
    },
    next: {
      assignments: Record<string, string | null>;
      extraSlots: string[];
      regions: Record<string, string[]>;
    },
  ): Promise<{ assignments: Record<string, string | null>; extraSlots: string[]; regions: Record<string, string[]> }> {
    const known = new Set(UKRAINE_REGIONS);
    for (const [slotId, regionList] of Object.entries(next.regions ?? {})) {
      for (const raw of regionList ?? []) {
        const c = canonicalizeRegionName(String(raw));
        if (!c || !known.has(c)) {
          throw new BadRequestException(`Невідома область у слоті ${slotId}: ${String(raw)}`);
        }
      }
    }

    const assignments = next.assignments ?? {};
    const desiredLeadByUser = new Map<string, string | null>();
    const slotByUser = new Map<string, string>();

    for (const [slotId, rawUid] of Object.entries(assignments)) {
      if (rawUid == null || rawUid === "") continue;
      const uid = String(rawUid).trim();
      if (!uid) continue;
      if (slotByUser.has(uid)) {
        throw new BadRequestException(
          `Один співробітник не може бути в двох слотах структури (id: ${uid})`,
        );
      }
      slotByUser.set(uid, slotId);
      const desired = desiredLeadUserIdForOrgSlot(slotId, assignments);
      desiredLeadByUser.set(uid, desired);
    }

    const leadIdsToValidate = new Set<string>();
    for (const lid of desiredLeadByUser.values()) {
      if (lid) leadIdsToValidate.add(lid);
    }
    if (leadIdsToValidate.size > 0) {
      const leadUsers = await this.prisma.user.findMany({
        where: { id: { in: [...leadIdsToValidate] } },
        select: { id: true, role: true },
      });
      const byId = new Map(leadUsers.map((u) => [u.id, u]));
      for (const lid of leadIdsToValidate) {
        const u = byId.get(lid);
        if (!u || (u.role !== UserRole.LEAD && u.role !== UserRole.ADMIN)) {
          throw new BadRequestException(
            `У слоті lead1/lead2 має бути користувач з роллю LEAD або ADMIN (id: ${lid})`,
          );
        }
      }
    }

    const prevIds = this.collectAssignmentUserIds(current.assignments ?? {});
    const nextIds = this.collectAssignmentUserIds(assignments);

    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { id: ORG_CHART_STRUCTURE_KEY },
        create: { id: ORG_CHART_STRUCTURE_KEY, value: next as Prisma.InputJsonValue },
        update: { value: next as Prisma.InputJsonValue },
      });

      for (const uid of prevIds) {
        if (!nextIds.has(uid)) {
          await tx.user.updateMany({ where: { id: uid }, data: { leadId: null } });
        }
      }

      for (const [uid, desiredLeadId] of desiredLeadByUser) {
        if (uid === desiredLeadId) {
          throw new BadRequestException("leadId не може збігатися з id користувача");
        }
        await tx.user.updateMany({
          where: { id: uid },
          data: { leadId: desiredLeadId },
        });
      }
    });

    return next;
  }
}
