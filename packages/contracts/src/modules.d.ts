export declare const ModuleIds: {
  readonly CoreCrm: "core.crm";
  readonly VoiceOutbound: "ext.voice_outbound";
  readonly Finance: "ext.finance";
  readonly ProductionPlanning: "ext.production_planning";
  readonly IntegrationsTelegram: "int.integrations_telegram";
  readonly NovaPoshta: "int.nova_poshta";
  readonly GoogleSheet: "int.google_sheet";
  readonly Bitrix: "int.bitrix";
  readonly Ringostat: "int.ringostat";
};

export type ModuleId = (typeof ModuleIds)[keyof typeof ModuleIds];

export type ModuleKind = "core" | "extension" | "integration";

export type ModuleDelivery = "in_process" | "external_service";

export type ModuleControlPlane = {
  entitlementKey: ModuleId;
  bundleSelectable: boolean;
};

export type ModuleManifestV1 = {
  id: ModuleId;
  kind: ModuleKind;
  version: 1;
  displayName: string;
  description: string;
  dependsOn: ModuleId[];
  delivery: ModuleDelivery;
  controlPlane: ModuleControlPlane;
};

export type SystemModuleState = ModuleManifestV1 & {
  installed: boolean;
  licensed: boolean;
  enabled: boolean;
  depsOk: boolean;
  /** Runtime can reach module service (health); monolith defaults true until split images. */
  reachable: boolean;
  effective: boolean;
};

export type SystemModulesResponse = {
  modules: SystemModuleState[];
};
