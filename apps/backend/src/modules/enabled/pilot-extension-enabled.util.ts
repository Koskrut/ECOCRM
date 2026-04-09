import { ModuleIds, type ModuleId } from "../module-ids";
import { PILOT_EXTENSION_ID_SET } from "./modules-enabled.constants";

/**
 * Validates that `ids` are unique pilot extension ids and returns a stable sorted list for storage.
 */
export function normalizePilotExtensionEnabledList(ids: readonly string[]): string[] {
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) {
    throw new Error("DUPLICATE_IDS");
  }
  for (const id of uniq) {
    if (!PILOT_EXTENSION_ID_SET.has(id)) {
      throw new Error("INVALID_ID");
    }
  }
  return [...uniq].sort();
}

/**
 * Parse stored JSON `enabled` array: only pilot extension strings allowed (plus legacy core.crm ignored).
 * Returns sorted unique pilot ids, or null if shape is invalid.
 */
export function parseStoredPilotExtensionIds(v: unknown): string[] | null {
  if (!v || typeof v !== "object") return null;
  const enabled = (v as { enabled?: unknown }).enabled;
  if (!Array.isArray(enabled)) return null;
  const acc = new Set<string>();
  for (const it of enabled) {
    if (typeof it !== "string") return null;
    if (it === ModuleIds.CoreCrm) continue;
    if (PILOT_EXTENSION_ID_SET.has(it)) acc.add(it);
    else return null;
  }
  return [...acc].sort();
}

/** Full enabled set for module runtime: core always on + stored pilots. */
export function moduleIdSetFromPilotStorage(pilotIdsSorted: readonly string[]): Set<ModuleId> {
  const out = new Set<ModuleId>([ModuleIds.CoreCrm]);
  for (const id of pilotIdsSorted) {
    out.add(id as ModuleId);
  }
  return out;
}
