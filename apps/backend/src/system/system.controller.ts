import { Controller, Get, Inject } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { LicenseStateProvider } from "../modules/license/license-state.provider";
import { ModuleStateService } from "../modules/module-state.service";
import type { SystemLicenseStatusDto } from "./dto/system-license-status.dto";
import type { SystemModulesResponseDto } from "./dto/system-modules.dto";
import type { SystemReleaseDto } from "./dto/system-release.dto";
import type { SystemVersionDto } from "./dto/system-version.dto";
import { SystemReleaseService } from "./system-release.service";
import { SystemVersionService } from "./system-version.service";
import { Public } from "../auth/public.decorator";
import { ControlPlanePhoneHomeService } from "./control-plane-phone-home.service";
import type { SystemControlPlaneDto } from "./dto/system-control-plane.dto";

@Controller("system")
export class SystemController {
  constructor(
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
    @Inject(LicenseStateProvider) private readonly licenseProvider: LicenseStateProvider,
    @Inject(SystemReleaseService) private readonly releaseService: SystemReleaseService,
    @Inject(SystemVersionService) private readonly versionService: SystemVersionService,
    @Inject(ControlPlanePhoneHomeService) private readonly controlPlanePhoneHome: ControlPlanePhoneHomeService,
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

  @Get("version")
  @Public()
  version(): SystemVersionDto {
    return this.versionService.getVersion();
  }

  @Get("backend-variant")
  @Roles(UserRole.ADMIN)
  backendVariant(): { variant: string } {
    return { variant: process.env.BACKEND_VARIANT ?? "full" };
  }

  @Get("control-plane")
  @Roles(UserRole.ADMIN)
  controlPlane(): SystemControlPlaneDto {
    return this.controlPlanePhoneHome.getTelemetry();
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
        reachable: m.reachable,
        effective: m.effective,
      })),
    };
  }
}
