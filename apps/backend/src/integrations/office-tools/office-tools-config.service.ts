import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ModuleIds } from "../../modules/module-ids";
import { ModuleStateService } from "../../modules/module-state.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  OFFICE_TOOLS_DEFAULT_BASE_URL,
  OFFICE_TOOLS_PROVIDER,
} from "./office-tools.constants";
import type {
  OfficeToolsConfig,
  OfficeToolsPublicConfig,
  OfficeToolsRuntimeConfig,
} from "./office-tools.types";

function maskToken(value: string | undefined | null): string {
  if (!value || value.length < 8) return value ? "••••" : "";
  return "••••" + value.slice(-4);
}

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

  async getConfig(): Promise<OfficeToolsPublicConfig> {
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
      apiKeyMasked: maskToken(row?.apiToken),
    };
  }

  async getRuntimeConfig(): Promise<OfficeToolsRuntimeConfig> {
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: OFFICE_TOOLS_PROVIDER },
    });
    const cfg = (row?.config ?? {}) as OfficeToolsConfig;
    const apiKey = row?.apiToken?.trim() || process.env.OFFICE_TOOLS_API_KEY?.trim() || null;
    return {
      isEnabled: row?.isEnabled ?? false,
      baseUrl: (cfg.baseUrl?.trim() || OFFICE_TOOLS_DEFAULT_BASE_URL).replace(/\/+$/, ""),
      stockId: cfg.stockId ?? 1,
      empId: cfg.empId ?? 1,
      managerId: cfg.managerId ?? 1,
      codeId1: cfg.codeId1 ?? 60,
      currId: cfg.currId ?? 980,
      configuredByUserId: cfg.configuredByUserId,
      apiKeyMasked: maskToken(apiKey),
      apiKey,
    };
  }

  async setConfig(
    body: Partial<OfficeToolsConfig>,
    actorUserId?: string,
  ): Promise<OfficeToolsPublicConfig> {
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

    let apiToken = existing?.apiToken ?? null;
    if (typeof body.apiKey === "string") {
      apiToken = body.apiKey.trim() ? body.apiKey.trim() : null;
    }

    await this.prisma.integrationSetting.upsert({
      where: existing ? { id: existing.id } : { id: "office_tools_default" },
      create: {
        id: existing?.id ?? "office_tools_default",
        provider: OFFICE_TOOLS_PROVIDER,
        isEnabled,
        apiToken,
        config: next as Prisma.InputJsonValue,
      },
      update: {
        isEnabled,
        apiToken,
        config: next as Prisma.InputJsonValue,
      },
    });

    return this.getConfig();
  }

  async requireActiveConfig(): Promise<OfficeToolsRuntimeConfig> {
    const cfg = await this.getRuntimeConfig();
    if (!(await this.isModuleEffective()) || !cfg.isEnabled) {
      throw new Error("Office Tools is not enabled");
    }
    return cfg;
  }

  requestContext(cfg: { baseUrl: string; apiKey?: string | null }) {
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey ?? null };
  }
}
