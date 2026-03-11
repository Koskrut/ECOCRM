import { Controller, Get } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";

@Controller("store")
export class StoreConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get("config")
  getConfig() {
    return this.settings.getStoreConfigPublic();
  }
}
