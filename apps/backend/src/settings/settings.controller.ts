import { Body, Controller, Get, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import type {
  ExchangeRates,
  GoogleMapsConfig,
  GoogleSheetConfig,
  MetaLeadAdsConfig,
  MetaMessagingConfig,
  NovaPoshtaIntegrationConfig,
  OrderLineDiscountsConfig,
  StoreConfig,
  TelegramConfig,
} from "./settings.service";
import type { OutboundVoiceIntegrationConfig } from "./settings.service";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("exchange-rates")
  @Roles(UserRole.ADMIN)
  getExchangeRates() {
    return this.settings.getExchangeRates();
  }

  @Patch("exchange-rates")
  @Roles(UserRole.ADMIN)
  setExchangeRates(@Body() body: Partial<ExchangeRates>) {
    return this.settings.setExchangeRates(body);
  }

  @Get("currency-config")
  getCurrencyConfig() {
    return this.settings.getCurrencyConfig();
  }

  @Get("order-discounts")
  getOrderLineDiscounts() {
    return this.settings.getOrderLineDiscounts();
  }

  @Patch("order-discounts")
  @Roles(UserRole.ADMIN)
  setOrderLineDiscounts(@Body() body: Partial<OrderLineDiscountsConfig>) {
    return this.settings.setOrderLineDiscounts(body);
  }

  @Get("meta-lead-ads")
  @Roles(UserRole.ADMIN)
  getMetaLeadAdsConfig() {
    return this.settings.getMetaLeadAdsConfig();
  }

  @Patch("meta-lead-ads")
  @Roles(UserRole.ADMIN)
  setMetaLeadAdsConfig(@Body() body: Partial<MetaLeadAdsConfig>) {
    return this.settings.setMetaLeadAdsConfig(body);
  }

  @Get("meta-messaging")
  @Roles(UserRole.ADMIN)
  @RequireModule(ModuleIds.IntegrationsMetaMessaging)
  getMetaMessagingConfig() {
    return this.settings.getMetaMessagingConfig();
  }

  @Patch("meta-messaging")
  @Roles(UserRole.ADMIN)
  @RequireModule(ModuleIds.IntegrationsMetaMessaging)
  setMetaMessagingConfig(@Body() body: Partial<MetaMessagingConfig>) {
    return this.settings.setMetaMessagingConfig(body);
  }

  @Get("meta-lead-ads/public")
  @Public()
  getMetaLeadAdsPublicConfig() {
    return this.settings.getMetaLeadAdsPublicConfig();
  }

  @Get("google-maps")
  @Roles(UserRole.ADMIN)
  getGoogleMapsConfig() {
    return this.settings.getGoogleMapsConfig();
  }

  @Patch("google-maps")
  @Roles(UserRole.ADMIN)
  setGoogleMapsConfig(@Body() body: Partial<GoogleMapsConfig>) {
    return this.settings.setGoogleMapsConfig(body);
  }

  @Get("google-maps/public")
  getGoogleMapsPublicConfig() {
    return this.settings.getGoogleMapsPublicConfig();
  }

  @Get("google-sheet")
  @RequireModule(ModuleIds.GoogleSheet)
  @Roles(UserRole.ADMIN)
  getGoogleSheetConfig() {
    return this.settings.getGoogleSheetConfig();
  }

  @Patch("google-sheet")
  @RequireModule(ModuleIds.GoogleSheet)
  @Roles(UserRole.ADMIN)
  setGoogleSheetConfig(@Body() body: Partial<GoogleSheetConfig>) {
    return this.settings.setGoogleSheetConfig(body);
  }

  @Get("nova-poshta")
  @RequireModule(ModuleIds.NovaPoshta)
  @Roles(UserRole.ADMIN)
  getNovaPoshtaIntegrationConfig() {
    return this.settings.getNovaPoshtaIntegrationConfig();
  }

  @Patch("nova-poshta")
  @RequireModule(ModuleIds.NovaPoshta)
  @Roles(UserRole.ADMIN)
  setNovaPoshtaIntegrationConfig(
    @Body() body: Partial<NovaPoshtaIntegrationConfig & { isEnabled?: boolean; apiKey?: string }>,
  ) {
    return this.settings.setNovaPoshtaIntegrationConfig(body);
  }

  @Get("telegram")
  @RequireModule(ModuleIds.IntegrationsTelegram)
  @Roles(UserRole.ADMIN)
  getTelegramConfig() {
    return this.settings.getTelegramConfig();
  }

  @Patch("telegram")
  @RequireModule(ModuleIds.IntegrationsTelegram)
  @Roles(UserRole.ADMIN)
  setTelegramConfig(@Body() body: Partial<TelegramConfig>) {
    return this.settings.setTelegramConfig(body);
  }

  @Get("outbound-voice")
  @RequireModule(ModuleIds.VoiceOutbound)
  @Roles(UserRole.ADMIN)
  getOutboundVoiceIntegrationConfig() {
    return this.settings.getOutboundVoiceIntegrationConfig();
  }

  @Patch("outbound-voice")
  @RequireModule(ModuleIds.VoiceOutbound)
  @Roles(UserRole.ADMIN)
  setOutboundVoiceIntegrationConfig(
    @Body()
    body: Partial<OutboundVoiceIntegrationConfig> & {
      isEnabled?: boolean;
      webhookSecret?: string;
      apiToken?: string;
    },
  ) {
    return this.settings.setOutboundVoiceIntegrationConfig(body);
  }

  @Get("store")
  @Roles(UserRole.ADMIN)
  getStoreConfig() {
    return this.settings.getStoreConfig();
  }

  @Patch("store")
  @Roles(UserRole.ADMIN)
  setStoreConfig(@Body() body: Partial<StoreConfig>) {
    return this.settings.setStoreConfig(body);
  }

  @Get("org-chart")
  @Roles(UserRole.ADMIN)
  getOrgChartStructure() {
    return this.settings.getOrgChartStructure();
  }

  @Patch("org-chart")
  @Roles(UserRole.ADMIN)
  setOrgChartStructure(
    @Body()
    body: {
      assignments?: Record<string, string | null>;
      extraSlots?: string[];
      regions?: Record<string, string[]>;
    }
  ) {
    return this.settings.setOrgChartStructure(body);
  }
}
