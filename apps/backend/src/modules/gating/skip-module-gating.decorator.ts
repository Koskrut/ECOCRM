import { SetMetadata } from "@nestjs/common";

export const SKIP_MODULE_GATING_KEY = "skip_module_gating";

/**
 * Marks a route as exempt from module gating even when the controller (or class)
 * declares `@RequireModule`. Use for public webhooks that must always return a
 * fast ack so the upstream provider does not retry when the module is disabled.
 */
export function SkipModuleGating() {
  return SetMetadata(SKIP_MODULE_GATING_KEY, true);
}
