import { Body, Controller, Get, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles.decorator";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import { UpcConsentService, type UpcSettings } from "./upc-consent.service";

@Controller("integrations/upc/settings")
@RequireModule(ModuleIds.Upc)
@Roles(UserRole.ADMIN)
export class UpcSettingsController {
  constructor(private readonly consent: UpcConsentService) {}

  @Get()
  getSettings() {
    return this.consent.getSettings();
  }

  @Patch()
  updateSettings(@Body() body: UpcSettings) {
    return this.consent.updateSettings(body);
  }
}
