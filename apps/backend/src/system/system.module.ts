import { Module } from "@nestjs/common";
import { EnabledModulesProvider } from "../modules/enabled/enabled-modules.provider";
import { SystemSettingEnabledModulesProvider } from "../modules/enabled/system-setting-enabled-modules.provider";
import { FileLicenseStateProvider } from "../modules/license/file-license-state.provider";
import { LicenseServerProvider } from "../modules/license/license-server.provider";
import { LicenseStateProvider } from "../modules/license/license-state.provider";
import { ModuleStateService } from "../modules/module-state.service";
import { ControlPlanePhoneHomeService } from "./control-plane-phone-home.service";
import { SystemController } from "./system.controller";
import { SystemModulesEnabledWriteService } from "./system-modules-enabled-write.service";
import { SystemReleaseService } from "./system-release.service";

const activeLicenseProviderClass =
  process.env.LICENSE_MODE === "server" ? LicenseServerProvider : FileLicenseStateProvider;

console.log(
  `[LicenseModule] Active provider: ${
    process.env.LICENSE_MODE === "server" ? "LicenseServerProvider" : "FileLicenseStateProvider"
  }`,
);

@Module({
  controllers: [SystemController],
  providers: [
    ModuleStateService,
    ControlPlanePhoneHomeService,
    SystemReleaseService,
    SystemModulesEnabledWriteService,
    {
      provide: EnabledModulesProvider,
      useClass: SystemSettingEnabledModulesProvider,
    },
    {
      provide: LicenseStateProvider,
      useClass: activeLicenseProviderClass,
    },
  ],
  exports: [ModuleStateService],
})
export class SystemModule {}
