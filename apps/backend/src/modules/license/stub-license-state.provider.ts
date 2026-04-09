import { Injectable } from "@nestjs/common";
import { MODULE_REGISTRY } from "../module-registry";
import type { ModuleId } from "../module-ids";
import { LicenseStateProvider, type LicenseState } from "./license-state.provider";

function parseLicensedModulesFromEnv(): Set<ModuleId> | null {
  const raw = process.env.LICENSED_MODULES;
  if (!raw || !raw.trim()) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const known = new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]);
  const out = new Set<ModuleId>();
  for (const p of parts) {
    if (known.has(p as ModuleId)) out.add(p as ModuleId);
  }
  return out;
}

@Injectable()
export class StubLicenseStateProvider extends LicenseStateProvider {
  async getLicenseState(): Promise<LicenseState> {
    const override = parseLicensedModulesFromEnv();
    const all = new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]);
    return {
      isValid: true,
      licensedModules: override ?? all,
    };
  }
}
