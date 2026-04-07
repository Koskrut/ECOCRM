import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { RingostatBackfillService } from "../integrations/ringostat/ringostat-backfill.service";
import { RingostatReconcileService } from "../integrations/ringostat/ringostat-reconcile.service";
import { RingostatRekeyUniqueidService } from "../integrations/ringostat/ringostat-rekey-uniqueid.service";
import type {
  ExchangeRates,
  GoogleMapsConfig,
  GoogleSheetConfig,
  MetaLeadAdsConfig,
  StoreConfig,
  TelegramConfig,
} from "./settings.service";
import type { OutboundVoiceIntegrationConfig, RingostatConfig } from "./settings.service";
import { RingostatBackfillDto } from "./dto/ringostat-backfill.dto";
import { RingostatReconcileDto } from "./dto/ringostat-reconcile.dto";
import { RingostatRekeyUniqueidDto } from "./dto/ringostat-rekey-uniqueid.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ringostatBackfill: RingostatBackfillService,
    private readonly ringostatReconcile: RingostatReconcileService,
    private readonly ringostatRekeyUniqueid: RingostatRekeyUniqueidService,
  ) {}

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
  @Roles(UserRole.ADMIN)
  getGoogleSheetConfig() {
    return this.settings.getGoogleSheetConfig();
  }

  @Patch("google-sheet")
  @Roles(UserRole.ADMIN)
  setGoogleSheetConfig(@Body() body: Partial<GoogleSheetConfig>) {
    return this.settings.setGoogleSheetConfig(body);
  }

  @Get("telegram")
  @Roles(UserRole.ADMIN)
  getTelegramConfig() {
    return this.settings.getTelegramConfig();
  }

  @Patch("telegram")
  @Roles(UserRole.ADMIN)
  setTelegramConfig(@Body() body: Partial<TelegramConfig>) {
    return this.settings.setTelegramConfig(body);
  }

  @Get("ringostat")
  @Roles(UserRole.ADMIN)
  getRingostatConfig() {
    return this.settings.getRingostatConfig();
  }

  @Patch("ringostat")
  @Roles(UserRole.ADMIN)
  setRingostatConfig(@Body() body: Partial<RingostatConfig>) {
    return this.settings.setRingostatConfig(body);
  }

  /** Historical import from Ringostat /calls/list (chunked, overlapping windows; upsert by external id). */
  @Post("ringostat/backfill")
  @Roles(UserRole.ADMIN)
  runRingostatBackfill(@Body() body: RingostatBackfillDto) {
    return this.ringostatBackfill.backfill(body.from, body.to);
  }

  @Post("ringostat/reconcile")
  @Roles(UserRole.ADMIN)
  runRingostatReconcile(@Body() body: RingostatReconcileDto) {
    return this.ringostatReconcile.reconcile(body);
  }

  /**
   * Repairs historical rows created with synthetic externalId (when /calls/list didn't return uniqueid),
   * by merging duplicates and re-keying to stable uniqueid.
   */
  @Post("ringostat/rekey-uniqueid")
  @Roles(UserRole.ADMIN)
  runRingostatRekeyUniqueid(@Body() body: RingostatRekeyUniqueidDto) {
    return this.ringostatRekeyUniqueid.rekey(body);
  }

  @Get("outbound-voice")
  @Roles(UserRole.ADMIN)
  getOutboundVoiceIntegrationConfig() {
    return this.settings.getOutboundVoiceIntegrationConfig();
  }

  @Patch("outbound-voice")
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
