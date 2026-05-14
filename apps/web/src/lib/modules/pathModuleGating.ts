import type { ModuleId } from "./module-ids";
import { ModuleIds } from "./module-ids";

/**
 * When modules are loaded (`useModules` ready), hide nav/settings entries unless the module is effective.
 * `null` means no module gate (always show for authenticated app shell).
 */
export function sidebarHrefModuleId(href: string): ModuleId | null {
  if (href.startsWith("/planning")) return ModuleIds.ProductionPlanning;
  if (href.startsWith("/payments")) return ModuleIds.Finance;
  if (href.startsWith("/inbox/telegram")) return ModuleIds.IntegrationsTelegram;
  if (href.startsWith("/outbound")) return ModuleIds.VoiceOutbound;
  if (href.startsWith("/work/calls")) return ModuleIds.ManualCalling;
  if (href.startsWith("/visits")) return ModuleIds.Visits;
  return null;
}

export function settingsHrefModuleId(href: string): ModuleId | null {
  if (href.startsWith("/settings/fop")) return ModuleIds.Finance;
  if (href.startsWith("/settings/google-sheet")) return ModuleIds.GoogleSheet;
  if (href.startsWith("/settings/ringostat")) return ModuleIds.Ringostat;
  if (href.startsWith("/settings/nova-poshta")) return ModuleIds.NovaPoshta;
  if (href.startsWith("/settings/outbound-voice")) return ModuleIds.VoiceOutbound;
  if (href.startsWith("/settings/telegram")) return ModuleIds.IntegrationsTelegram;
  if (href.startsWith("/settings/store")) return ModuleIds.Store;
  return null;
}
