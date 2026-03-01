import { Body, Controller, Get, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import type { ExchangeRates } from "./settings.service";
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
}
