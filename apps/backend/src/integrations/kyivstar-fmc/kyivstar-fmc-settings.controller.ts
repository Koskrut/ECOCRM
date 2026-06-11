import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles.decorator";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import type { KyivstarFmcConfig } from "../../settings/settings.service";
import { SettingsService } from "../../settings/settings.service";
import { KyivstarFmcBackfillDto } from "../../settings/dto/kyivstar-fmc-backfill.dto";
import { KyivstarFmcBackfillService } from "./kyivstar-fmc-backfill.service";

@Controller("settings")
@RequireModule(ModuleIds.KyivstarFmc)
export class KyivstarFmcSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly backfill: KyivstarFmcBackfillService,
  ) {}

  @Get("kyivstar-fmc")
  @Roles(UserRole.ADMIN)
  getConfig() {
    return this.settings.getKyivstarFmcConfig();
  }

  @Patch("kyivstar-fmc")
  @Roles(UserRole.ADMIN)
  setConfig(@Body() body: Partial<KyivstarFmcConfig>) {
    return this.settings.setKyivstarFmcConfig(body);
  }

  @Post("kyivstar-fmc/backfill")
  @Roles(UserRole.ADMIN)
  runBackfill(@Body() body: KyivstarFmcBackfillDto) {
    return this.backfill.backfill(body.from, body.to);
  }
}
