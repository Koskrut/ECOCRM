import { ModuleIds } from "../module-ids";

/** SystemSetting row id for Phase 1 pilot enabled extensions only (no core.crm in storage). */
export const MODULES_ENABLED_V1_KEY = "modules_enabled_v1";

/** Pilot extension module ids stored in `modules_enabled_v1.value.enabled`. */
export const PILOT_EXTENSION_MODULE_IDS = [
  ModuleIds.VoiceOutbound,
  ModuleIds.Finance,
  ModuleIds.IntegrationsTelegram,
] as const;

export const PILOT_EXTENSION_ID_SET = new Set<string>(PILOT_EXTENSION_MODULE_IDS);
