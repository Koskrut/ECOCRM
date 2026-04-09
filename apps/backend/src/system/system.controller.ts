import { Controller, Get, Inject } from "@nestjs/common";
import type { SystemModulesResponseDto } from "./dto/system-modules.dto";
import { ModuleStateService } from "../modules/module-state.service";

@Controller("system")
export class SystemController {
  constructor(@Inject(ModuleStateService) private readonly modules: ModuleStateService) {}

  @Get("modules")
  async listModules(): Promise<SystemModulesResponseDto> {
    const modules = await this.modules.listStates();
    return {
      modules: modules.map((m) => ({
        id: m.id,
        kind: m.kind,
        displayName: m.displayName,
        dependsOn: m.dependsOn,
        installed: m.installed,
        licensed: m.licensed,
        enabled: m.enabled,
        depsOk: m.depsOk,
        effective: m.effective,
      })),
    };
  }
}
