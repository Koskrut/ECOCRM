import { Module } from "@nestjs/common";
import { EnabledModulesProvider } from "../modules/enabled/enabled-modules.provider";
import { SystemSettingEnabledModulesProvider } from "../modules/enabled/system-setting-enabled-modules.provider";
import { FileLicenseStateProvider } from "../modules/license/file-license-state.provider";
import { LicenseStateProvider } from "../modules/license/license-state.provider";
import { ModuleStateService } from "../modules/module-state.service";
import { SystemController } from "./system.controller";
import { SystemModulesEnabledWriteService } from "./system-modules-enabled-write.service";
import { SystemReleaseService } from "./system-release.service";

@Module({
  controllers: [SystemController],
  providers: [
    ModuleStateService,
    SystemReleaseService,
    SystemModulesEnabledWriteService,
    {
      provide: EnabledModulesProvider,
      useClass: SystemSettingEnabledModulesProvider,
    },
    {
      provide: LicenseStateProvider,
      useClass: FileLicenseStateProvider,
    },
  ],
  exports: [ModuleStateService],
})
export class SystemModule {}
