import { Module } from "@nestjs/common";
import { EnabledModulesProvider } from "../modules/enabled/enabled-modules.provider";
import { SystemSettingEnabledModulesProvider } from "../modules/enabled/system-setting-enabled-modules.provider";
import { FileLicenseStateProvider } from "../modules/license/file-license-state.provider";
import { StubLicenseStateProvider } from "../modules/license/stub-license-state.provider";
import { LicenseStateProvider } from "../modules/license/license-state.provider";
import { ModuleHealthService } from "../modules/module-health.service";
import { ModuleStateService } from "../modules/module-state.service";
import { RoutingModule } from "../routing/routing.module";
import { ControlPlanePhoneHomeService } from "./control-plane-phone-home.service";
import { SystemController } from "./system.controller";
import { SystemReleaseService } from "./system-release.service";
import { SystemAutoUpdateCron } from "./system-auto-update.cron";
import { SystemUpdateService } from "./system-update.service";
import { SystemVersionService } from "./system-version.service";

/** Use stub when LICENSE_FILE_PATH is missing so local smoke can exercise licensed modules. */
const activeLicenseProviderClass =
  process.env.LICENSE_USE_STUB === "1" ? StubLicenseStateProvider : FileLicenseStateProvider;

@Module({
  imports: [RoutingModule],
  controllers: [SystemController],
  providers: [
    ModuleHealthService,
    ModuleStateService,
    ControlPlanePhoneHomeService,
    SystemReleaseService,
    SystemUpdateService,
    SystemAutoUpdateCron,
    SystemVersionService,
    {
      provide: EnabledModulesProvider,
      useClass: SystemSettingEnabledModulesProvider,
    },
    {
      provide: LicenseStateProvider,
      useClass: activeLicenseProviderClass,
    },
  ],
  exports: [ModuleHealthService, ModuleStateService],
})
export class SystemModule {}
