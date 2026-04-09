import { SetMetadata } from "@nestjs/common";
import type { ModuleId } from "../module-ids";

export const REQUIRE_MODULE_KEY = "require_module";

export function RequireModule(moduleId: ModuleId) {
  return SetMetadata(REQUIRE_MODULE_KEY, moduleId);
}
