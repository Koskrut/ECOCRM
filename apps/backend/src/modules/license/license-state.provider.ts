import type { ModuleId } from "../module-ids";

export type LicenseState = {
  isValid: boolean;
  licensedModules: Set<ModuleId>;
};

export abstract class LicenseStateProvider {
  abstract getLicenseState(): Promise<LicenseState>;
}
