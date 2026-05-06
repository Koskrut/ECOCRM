import { defineModule } from "@crm/module-sdk/manifest";
import { ModuleIds } from "./module-ids";
import type { ModuleDef, ModuleKind } from "./module-types";

type Registry = Record<string, ModuleDef>;

export const MODULE_REGISTRY: Registry = {
  [ModuleIds.CoreCrm]: defineModule({
    id: ModuleIds.CoreCrm,
    kind: "core" satisfies ModuleKind,
    version: 1,
    displayName: "CRM Core",
    description: "Core CRM entities, auth, settings, orders, leads, contacts, and platform services.",
    dependsOn: [],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.CoreCrm,
      bundleSelectable: false,
    },
  }),
  [ModuleIds.Visits]: defineModule({
    id: ModuleIds.Visits,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Visits",
    description: "Field visit planning, timeline scheduling, route plans, route sessions, and visit history.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Visits,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.ManualCalling]: defineModule({
    id: ModuleIds.ManualCalling,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Manual Calling",
    description: "Manual calling workspace, calls history, outbound campaigns, and outbound voice webhooks.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "external_service",
    controlPlane: {
      entitlementKey: ModuleIds.ManualCalling,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.VoiceOutbound]: defineModule({
    id: ModuleIds.VoiceOutbound,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "AI Calls / Outbound (Legacy)",
    description:
      "Deprecated compatibility entitlement for old licenses. Use ext.manual_calling + int.ringostat.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "external_service",
    controlPlane: {
      entitlementKey: ModuleIds.VoiceOutbound,
      bundleSelectable: false,
    },
  }),
  [ModuleIds.Finance]: defineModule({
    id: ModuleIds.Finance,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Finance",
    description: "Payments, bank accounts, bank statement sync, transaction matching, and finance processing.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Finance,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.ProductionPlanning]: defineModule({
    id: ModuleIds.ProductionPlanning,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Production Planning",
    description: "BOM, demand rules, inventory snapshots, production batches, and weekly planning.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.ProductionPlanning,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.Store]: defineModule({
    id: ModuleIds.Store,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Online Store",
    description:
      "Public storefront integration: theme, banners, contacts, store configuration, and CRM payment URL.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Store,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.IntegrationsTelegram]: defineModule({
    id: ModuleIds.IntegrationsTelegram,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Telegram Inbox",
    description: "Telegram bot, inbox conversations, password reset delivery, and customer messaging.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.IntegrationsTelegram,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.NovaPoshta]: defineModule({
    id: ModuleIds.NovaPoshta,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Nova Poshta",
    description: "Nova Poshta directories, TTN creation, and delivery status synchronization.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.NovaPoshta,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.GoogleSheet]: defineModule({
    id: ModuleIds.GoogleSheet,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Google Sheets",
    description: "Google Sheet order export and document webhook integration.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.GoogleSheet,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.Bitrix]: defineModule({
    id: ModuleIds.Bitrix,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Bitrix",
    description: "Bitrix initial import, delta sync, and webhook processing.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Bitrix,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.Ringostat]: defineModule({
    id: ModuleIds.Ringostat,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Ringostat",
    description: "Ringostat call ingestion, polling, recordings, and retrofits.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Ringostat,
      bundleSelectable: true,
    },
  }),
};

export function registryModuleIds(): ModuleDef["id"][] {
  return Object.keys(MODULE_REGISTRY).sort() as ModuleDef["id"][];
}

export function coreModuleIds(): ModuleDef["id"][] {
  return registryModuleIds().filter((id) => MODULE_REGISTRY[id]?.kind === "core");
}

export function entitledModuleIds(): ModuleDef["id"][] {
  return registryModuleIds().filter((id) => MODULE_REGISTRY[id]?.kind !== "core");
}
