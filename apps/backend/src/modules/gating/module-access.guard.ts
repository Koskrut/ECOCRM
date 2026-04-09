import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { ModuleId } from "../module-ids";
import { ModuleStateService } from "../module-state.service";
import { REQUIRE_MODULE_KEY } from "./require-module.decorator";

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.MODULE_GATING_ENABLED !== "true") return true;

    const moduleId = this.reflector.getAllAndOverride<ModuleId | undefined>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleId) return true;

    const effective = await this.modules.isEffective(moduleId);
    if (!effective) throw new NotFoundException();
    return true;
  }
}
