import type { ModuleId } from "../module-ids";

export type LicenseValidationStatus = "valid" | "missing" | "invalid" | "expired";

export type LicenseState = {
  isValid: boolean;
  licensedModules: Set<ModuleId>;
  status: LicenseValidationStatus;
  expiresAt: string | null;
  customer: string | null;
  shortLicenseId: string | null;
};

export abstract class LicenseStateProvider {
  abstract getLicenseState(): Promise<LicenseState>;
}
