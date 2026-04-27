import type { ModuleId } from "./module-ids";

export type ModuleKind = "core" | "extension" | "integration";

export type ModuleDelivery = "in_process" | "external_service";

export type ModuleControlPlane = {
  /**
   * Entitlement V1 uses the same canonical module id strings as the runtime registry.
   * Keep this stable so phone-home can feed the licensedModules set directly.
   */
  entitlementKey: ModuleId;
  bundleSelectable: boolean;
};

export type ModuleDef = {
  id: ModuleId;
  kind: ModuleKind;
  version: 1;
  displayName: string;
  description: string;
  dependsOn: ModuleId[];
  delivery: ModuleDelivery;
  controlPlane: ModuleControlPlane;
};
