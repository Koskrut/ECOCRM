import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { Roles } from "../auth/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { OsrmRoutingService } from "../routing/osrm-routing.service";
import { LicenseStateProvider } from "../modules/license/license-state.provider";
import { ModuleStateService } from "../modules/module-state.service";
import type { SystemLicenseStatusDto } from "./dto/system-license-status.dto";
import type { SystemModulesResponseDto } from "./dto/system-modules.dto";
import type { SystemReleaseDto } from "./dto/system-release.dto";
import type { SystemUpdateApplyRequestDto, SystemUpdateJobDto, SystemUpdatePreflightDto, SystemUpdateStatusDto } from "./dto/system-update.dto";
import type { SystemVersionDto } from "./dto/system-version.dto";
import { SystemReleaseService } from "./system-release.service";
import { SystemUpdateService } from "./system-update.service";
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
    @Inject(SystemUpdateService) private readonly updateService: SystemUpdateService,
    @Inject(SystemVersionService) private readonly versionService: SystemVersionService,
    @Inject(ControlPlanePhoneHomeService) private readonly controlPlanePhoneHome: ControlPlanePhoneHomeService,
    @Inject(OsrmRoutingService) private readonly osrmRouting: OsrmRoutingService,
  ) {}

  @Get("modules")
  async listModules(): Promise<SystemModulesResponseDto> {
    return this.buildModulesResponse();
  }

  @Get("release")
  @Roles(UserRole.ADMIN)
  async release(): Promise<SystemReleaseDto> {
    return this.releaseService.getRelease();
  }

  @Get("update-status")
  @Roles(UserRole.ADMIN)
  async updateStatus(): Promise<SystemUpdateStatusDto> {
    return this.updateService.getStatus();
  }

  @Post("update/preflight")
  @Roles(UserRole.ADMIN)
  async updatePreflight(): Promise<SystemUpdatePreflightDto> {
    return this.updateService.preflight();
  }

  @Post("update/apply")
  @Roles(UserRole.ADMIN)
  async updateApply(
    @Body() body: SystemUpdateApplyRequestDto,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<SystemUpdateJobDto> {
    const requestedBy = req.user?.email ?? req.user?.id ?? "admin";
    return this.updateService.apply(requestedBy, body ?? {});
  }

  @Get("update/jobs/:id")
  @Roles(UserRole.ADMIN)
  async updateJob(@Param("id") id: string): Promise<SystemUpdateJobDto | null> {
    return this.updateService.getJob(id);
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

  @Get("routing-health")
  @Roles(UserRole.ADMIN)
  async routingHealth(): Promise<{
    provider: "osrm";
    baseUrl: string;
    profile: string;
    ok: boolean;
    latencyMs: number | null;
    error?: string;
  }> {
    const check = await this.osrmRouting.healthCheck();
    return {
      provider: "osrm",
      baseUrl: this.osrmRouting.resolveBaseUrl(),
      profile: this.osrmRouting.resolveProfile(),
      ...check,
    };
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
