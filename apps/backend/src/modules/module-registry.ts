import { ModuleIds } from "./module-ids";
import type { ModuleDef, ModuleKind } from "./module-types";

type Registry = Record<string, ModuleDef>;

export const MODULE_REGISTRY: Registry = {
  [ModuleIds.CoreCrm]: {
    id: ModuleIds.CoreCrm,
    kind: "core" satisfies ModuleKind,
    version: 1,
    displayName: "CRM Core",
    description: "Core CRM entities, auth, settings, store, orders, leads, contacts, and platform services.",
    dependsOn: [],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.CoreCrm,
      bundleSelectable: false,
    },
  },
  [ModuleIds.VoiceOutbound]: {
    id: ModuleIds.VoiceOutbound,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "AI Calls / Outbound",
    description: "Outbound calling, manual calling workspace, call history, and voice gateway integrations.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "external_service",
    controlPlane: {
      entitlementKey: ModuleIds.VoiceOutbound,
      bundleSelectable: true,
    },
  },
  [ModuleIds.Finance]: {
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
  },
  [ModuleIds.ProductionPlanning]: {
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
  },
  [ModuleIds.IntegrationsTelegram]: {
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
  },
  [ModuleIds.NovaPoshta]: {
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
  },
  [ModuleIds.GoogleSheet]: {
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
  },
  [ModuleIds.Bitrix]: {
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
  },
  [ModuleIds.Ringostat]: {
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
  },
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
