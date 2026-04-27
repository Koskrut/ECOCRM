import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { LicenseStateProvider } from "../modules/license/license-state.provider";
import { ModuleStateService } from "../modules/module-state.service";
import type { SystemLicenseStatusDto } from "./dto/system-license-status.dto";
import type { SystemModulesResponseDto } from "./dto/system-modules.dto";
import type { SystemReleaseDto } from "./dto/system-release.dto";
import type { UpdateSystemModulesEnabledDto } from "./dto/update-system-modules-enabled.dto";
import { SystemModulesEnabledWriteService } from "./system-modules-enabled-write.service";
import { SystemReleaseService } from "./system-release.service";

@Controller("system")
export class SystemController {
  constructor(
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
    @Inject(LicenseStateProvider) private readonly licenseProvider: LicenseStateProvider,
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

  @Get("license-status")
  @Roles(UserRole.ADMIN)
  async licenseStatus(): Promise<SystemLicenseStatusDto> {
    const state = await this.licenseProvider.getLicenseState();
    return {
      status: state.status,
      expiresAt: state.expiresAt,
      customer: state.customer,
      licenseId: state.shortLicenseId,
    };
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
        version: m.version,
        displayName: m.displayName,
        description: m.description,
        dependsOn: m.dependsOn,
        delivery: m.delivery,
        controlPlane: m.controlPlane,
        installed: m.installed,
        licensed: m.licensed,
        enabled: m.enabled,
        depsOk: m.depsOk,
        effective: m.effective,
      })),
    };
  }
}
