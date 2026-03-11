import { Body, Controller, Get, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import type {
  ExchangeRates,
  GoogleMapsConfig,
  MetaLeadAdsConfig,
  StoreConfig,
  TelegramConfig,
} from "./settings.service";
import type { RingostatConfig } from "./settings.service";
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
}
