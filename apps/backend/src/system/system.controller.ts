import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { ModuleStateService } from "../modules/module-state.service";
import type { SystemModulesResponseDto } from "./dto/system-modules.dto";
import type { SystemReleaseDto } from "./dto/system-release.dto";
import type { UpdateSystemModulesEnabledDto } from "./dto/update-system-modules-enabled.dto";
import { SystemModulesEnabledWriteService } from "./system-modules-enabled-write.service";
import { SystemReleaseService } from "./system-release.service";

@Controller("system")
export class SystemController {
  constructor(
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
    @Inject(SystemModulesEnabledWriteService)
    private readonly enabledWrite: SystemModulesEnabledWriteService,
    @Inject(SystemReleaseService) private readonly releaseService: SystemReleaseService,
  ) {}

  @Get("modules")
  async listModules(): Promise<SystemModulesResponseDto> {
    return this.buildModulesResponse();
  }

  @Get("release")
  @Roles(UserRole.ADMIN)
  release(): SystemReleaseDto {
    return this.releaseService.getRelease();
  }

  @Put("modules/enabled")
  @Roles(UserRole.ADMIN)
  async updateModulesEnabled(
    @Body() body: UpdateSystemModulesEnabledDto,
  ): Promise<SystemModulesResponseDto> {
    await this.enabledWrite.setPilotExtensionsEnabled(body.enabled);
    return this.buildModulesResponse();
  }

  private async buildModulesResponse(): Promise<SystemModulesResponseDto> {
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
