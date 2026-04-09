import { ModuleIds } from "./module-ids";
import type { ModuleDef, ModuleKind } from "./module-types";

type Registry = Record<string, ModuleDef>;

export const MODULE_REGISTRY: Registry = {
  [ModuleIds.CoreCrm]: {
    id: ModuleIds.CoreCrm,
    kind: "core" satisfies ModuleKind,
    displayName: "CRM Core",
    dependsOn: [],
  },
  [ModuleIds.VoiceOutbound]: {
    id: ModuleIds.VoiceOutbound,
    kind: "extension" satisfies ModuleKind,
    displayName: "AI Calls / Outbound",
    dependsOn: [ModuleIds.CoreCrm],
  },
  [ModuleIds.Finance]: {
    id: ModuleIds.Finance,
    kind: "extension" satisfies ModuleKind,
    displayName: "Finance",
    dependsOn: [ModuleIds.CoreCrm],
  },
  [ModuleIds.IntegrationsTelegram]: {
    id: ModuleIds.IntegrationsTelegram,
    kind: "extension" satisfies ModuleKind,
    displayName: "Telegram Inbox",
    dependsOn: [ModuleIds.CoreCrm],
  },
};
