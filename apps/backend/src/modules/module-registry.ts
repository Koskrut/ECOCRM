import { defineModule } from "@crm/module-sdk/manifest";
import { ModuleIds } from "./module-ids";
import type { ModuleDef, ModuleKind } from "./module-types";

type Registry = Record<string, ModuleDef>;

export const MODULE_REGISTRY: Registry = {
  // RU: ядро всегда in-process; sidecar не предусмотрен. Поле delivery в CP — «как лицензируется», не схема деплоя.
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
  // RU: только внутри монолита/полного backend; отдельного *_UPSTREAM_URL нет.
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
  // RU: в CP — external_service; HTTP может идти в outbound sidecar (`OUTBOUND_UPSTREAM_URL`), префиксы `/manual-calling`, `/calls` проксируются вместе с voice outbound.
  [ModuleIds.ManualCalling]: defineModule({
    id: ModuleIds.ManualCalling,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Manual Calling",
    description:
      "Manual calling workspace, calls history, and per-user manual dial queue (separate from AI outbound).",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "external_service",
    controlPlane: {
      entitlementKey: ModuleIds.ManualCalling,
      bundleSelectable: true,
    },
  }),
  // RU: external_service в CP; опционально `outbound_worker` + `OUTBOUND_UPSTREAM_URL` (прокси `/outbound`, `/integrations/outbound-voice`, …).
  [ModuleIds.VoiceOutbound]: defineModule({
    id: ModuleIds.VoiceOutbound,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "AI Outbound (Voice)",
    description:
      "AI outbound campaigns, dial queue, gateway webhooks, and outbound voice integration (ext.voice_outbound).",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "external_service",
    controlPlane: {
      entitlementKey: ModuleIds.VoiceOutbound,
      bundleSelectable: false,
    },
  }),
  // RU: in_process в манифесте; при FINANCE_UPSTREAM_URL ядро проксирует /payments, /bank и т.д. на finance_worker — без смены типа delivery в SDK.
  [ModuleIds.Finance]: defineModule({
    id: ModuleIds.Finance,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Finance",
    description:
      "Payments, bank transactions, payment allocation, and finance processing (bank statement providers: int.privat24, int.upc).",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Finance,
      bundleSelectable: true,
    },
  }),
  // RU: in_process; при PLANNING_UPSTREAM_URL — прокси на planning_worker.
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
  // RU: бизнес-логика в backend; публичный фронт — отдельный образ crm-store (compose.modules.store.yml), не Nest sidecar.
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
  // RU: только внутри процесса backend; отдельного worker-образа и TELEGRAM_UPSTREAM_URL в репозитории нет (не путать с outbound sidecar, куда входит модуль как зависимость worker).
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
  [ModuleIds.IntegrationsMetaMessaging]: defineModule({
    id: ModuleIds.IntegrationsMetaMessaging,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Meta Messaging Inbox",
    description:
      "Instagram Direct and Facebook Messenger inbox: webhooks, conversations, and replies from CRM.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.IntegrationsMetaMessaging,
      bundleSelectable: true,
    },
  }),
  // RU: in_process; при NP_UPSTREAM_URL — np_worker и прокси /np, /store/np и regex под заказы/отгрузки. См. docs/np-module-prod.md.
  [ModuleIds.NovaPoshta]: defineModule({
    id: ModuleIds.NovaPoshta,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Nova Poshta",
    description:
      "Nova Poshta directories, TTN creation, and delivery status synchronization. API key and sender: Settings → Nova Poshta (or env fallbacks).",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.NovaPoshta,
      bundleSelectable: true,
    },
  }),
  // RU: in_process; при GOOGLE_SHEET_UPSTREAM_URL — google_sheet_worker и прокси /integrations/google-sheet и regex.
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
  // RU: in_process; при BITRIX_UPSTREAM_URL — bitrix_worker и прокси /integrations/bitrix.
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
  // RU: in_process; при RINGOSTAT_UPSTREAM_URL — ringostat_worker и regex-прокси /integrations/ringostat, /settings/ringostat.
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
  // RU: in_process; при KYIVSTAR_FMC_UPSTREAM_URL — kyivstar_fmc_worker и regex-прокси /integrations/kyivstar-fmc, /settings/kyivstar-fmc.
  [ModuleIds.KyivstarFmc]: defineModule({
    id: ModuleIds.KyivstarFmc,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Kyivstar FMC",
    description:
      "Kyivstar Virtual Mobile PBX (Generic FMC API): call history import, callstate webhooks, recordings.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.KyivstarFmc,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.Privat24]: defineModule({
    id: ModuleIds.Privat24,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "Privat24",
    description:
      "Privat24 Autoclient: bank statement sync, CSV import, and requisites fetch for FOP accounts.",
    dependsOn: [ModuleIds.Finance],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Privat24,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.Upc]: defineModule({
    id: ModuleIds.Upc,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "UPC Open Banking",
    description: "UPC Open Banking AIS: consent, account information, and statement sync.",
    dependsOn: [ModuleIds.Finance],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.Upc,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.OneCPayments]: defineModule({
    id: ModuleIds.OneCPayments,
    kind: "integration" satisfies ModuleKind,
    version: 1,
    displayName: "1C Payments Import",
    description:
      "Import payment allocations from 1C Excel (.xlsb/.xlsx), match rows to CRM orders, and create Payment records.",
    dependsOn: [ModuleIds.Finance],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.OneCPayments,
      bundleSelectable: true,
    },
  }),
  [ModuleIds.RiskManagement]: defineModule({
    id: ModuleIds.RiskManagement,
    kind: "extension" satisfies ModuleKind,
    version: 1,
    displayName: "Risk Management",
    description:
      "Enterprise Risk Control Tower: credit, cash, inventory, production, shipping, field, team, pipeline, and platform health.",
    dependsOn: [ModuleIds.CoreCrm],
    delivery: "in_process",
    controlPlane: {
      entitlementKey: ModuleIds.RiskManagement,
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
