import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ModuleIds } from "../../modules/module-ids";
import { ModuleStateService } from "../../modules/module-state.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  OFFICE_TOOLS_DEFAULT_BASE_URL,
  OFFICE_TOOLS_PROVIDER,
} from "./office-tools.constants";
import type { OfficeToolsConfig } from "./office-tools.types";

@Injectable()
export class OfficeToolsConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modules: ModuleStateService,
  ) {}

  async isModuleEffective(): Promise<boolean> {
    if (process.env.MODULE_GATING_ENABLED === "true") {
      return this.modules.isEffective(ModuleIds.OfficeTools);
    }
    return true;
  }

  /** Module entitlement + IntegrationSetting.isEnabled. */
  async isActive(): Promise<boolean> {
    if (!(await this.isModuleEffective())) return false;
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: OFFICE_TOOLS_PROVIDER },
      select: { isEnabled: true },
    });
    return Boolean(row?.isEnabled);
  }

  async getConfig(): Promise<
    OfficeToolsConfig & { isEnabled: boolean; baseUrl: string }
  > {
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: OFFICE_TOOLS_PROVIDER },
    });
    const cfg = (row?.config ?? {}) as OfficeToolsConfig;
    return {
      isEnabled: row?.isEnabled ?? false,
      baseUrl: (cfg.baseUrl?.trim() || OFFICE_TOOLS_DEFAULT_BASE_URL).replace(/\/+$/, ""),
      stockId: cfg.stockId ?? 1,
      empId: cfg.empId ?? 1,
      managerId: cfg.managerId ?? 1,
      codeId1: cfg.codeId1 ?? 60,
      currId: cfg.currId ?? 980,
      configuredByUserId: cfg.configuredByUserId,
    };
  }

  async setConfig(
    body: Partial<OfficeToolsConfig>,
    actorUserId?: string,
  ): Promise<OfficeToolsConfig & { isEnabled: boolean; baseUrl: string }> {
    const existing = await this.prisma.integrationSetting.findFirst({
      where: { provider: OFFICE_TOOLS_PROVIDER },
    });
    const current = (existing?.config ?? {}) as OfficeToolsConfig;
    const next: OfficeToolsConfig = {
      baseUrl:
        typeof body.baseUrl === "string"
          ? body.baseUrl.trim() || OFFICE_TOOLS_DEFAULT_BASE_URL
          : current.baseUrl ?? OFFICE_TOOLS_DEFAULT_BASE_URL,
      stockId:
        typeof body.stockId === "number" && Number.isFinite(body.stockId)
          ? Math.trunc(body.stockId)
          : current.stockId ?? 1,
      empId:
        typeof body.empId === "number" && Number.isFinite(body.empId)
          ? Math.trunc(body.empId)
          : current.empId ?? 1,
      managerId:
        typeof body.managerId === "number" && Number.isFinite(body.managerId)
          ? Math.trunc(body.managerId)
          : current.managerId ?? 1,
      codeId1:
        typeof body.codeId1 === "number" && Number.isFinite(body.codeId1)
          ? Math.trunc(body.codeId1)
          : current.codeId1 ?? 60,
      currId:
        typeof body.currId === "number" && Number.isFinite(body.currId)
          ? Math.trunc(body.currId)
          : current.currId ?? 980,
      configuredByUserId: actorUserId ?? current.configuredByUserId,
    };
    const isEnabled =
      typeof body.isEnabled === "boolean" ? body.isEnabled : existing?.isEnabled ?? false;

    await this.prisma.integrationSetting.upsert({
      where: existing ? { id: existing.id } : { id: "office_tools_default" },
      create: {
        id: existing?.id ?? "office_tools_default",
        provider: OFFICE_TOOLS_PROVIDER,
        isEnabled,
        config: next as Prisma.InputJsonValue,
      },
      update: {
        isEnabled,
        config: next as Prisma.InputJsonValue,
      },
    });

    return this.getConfig();
  }

  async requireActiveConfig(): Promise<OfficeToolsConfig & { isEnabled: boolean; baseUrl: string }> {
    const cfg = await this.getConfig();
    if (!(await this.isModuleEffective()) || !cfg.isEnabled) {
      throw new Error("Office Tools is not enabled");
    }
    return cfg;
  }
}
