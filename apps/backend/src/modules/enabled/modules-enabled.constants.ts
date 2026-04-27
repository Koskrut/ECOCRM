import { entitledModuleIds } from "../module-registry";

/** SystemSetting row id for enabled entitled modules only (no core.crm in storage). */
export const MODULES_ENABLED_V1_KEY = "modules_enabled_v1";

/** Entitled module ids stored in `modules_enabled_v1.value.enabled`. */
export const PILOT_EXTENSION_MODULE_IDS = entitledModuleIds() as [string, ...string[]];

export const PILOT_EXTENSION_ID_SET = new Set<string>(PILOT_EXTENSION_MODULE_IDS);
