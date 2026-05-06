import { Inject, Injectable, Logger } from "@nestjs/common";
import { EnabledModulesProvider, type EnabledModulesState } from "./enabled-modules.provider";
import { LicenseStateProvider } from "../license/license-state.provider";

@Injectable()
export class SystemSettingEnabledModulesProvider extends EnabledModulesProvider {
  private readonly logger = new Logger(SystemSettingEnabledModulesProvider.name);

  constructor(@Inject(LicenseStateProvider) private readonly licenseProvider: LicenseStateProvider) {
    super();
  }

  async getEnabledModules(): Promise<EnabledModulesState> {
    try {
      const state = await this.licenseProvider.getLicenseState();
      return {
        enabledModules: new Set(state.licensedModules),
        source: "license_state",
      };
    } catch (e) {
      this.logger.warn(`Failed to resolve enabled modules from license state: ${e instanceof Error ? e.message : String(e)}`);
      return { enabledModules: new Set(), source: "error_fallback" };
    }
  }
}
