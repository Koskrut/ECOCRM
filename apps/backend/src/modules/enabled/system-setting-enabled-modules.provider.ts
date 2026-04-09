import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MODULE_REGISTRY } from "../module-registry";
import type { ModuleId } from "../module-ids";
import { EnabledModulesProvider, type EnabledModulesState } from "./enabled-modules.provider";

const KEY = "modules_enabled_v1";

type StoredShape = {
  enabled?: unknown;
};

function allEnabled(): EnabledModulesState {
  return {
    enabledModules: new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]),
    source: "default_all_enabled",
  };
}

function parseEnabled(v: unknown): Set<ModuleId> | null {
  if (!v || typeof v !== "object") return null;
  const enabled = (v as StoredShape).enabled;
  if (!Array.isArray(enabled)) return null;
  const known = new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]);
  const out = new Set<ModuleId>();
  for (const it of enabled) {
    if (typeof it !== "string") continue;
    if (known.has(it as ModuleId)) out.add(it as ModuleId);
  }
  return out;
}

@Injectable()
export class SystemSettingEnabledModulesProvider extends EnabledModulesProvider {
  private readonly logger = new Logger(SystemSettingEnabledModulesProvider.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async getEnabledModules(): Promise<EnabledModulesState> {
    try {
      const row = await this.prisma.systemSetting.findUnique({
        where: { id: KEY },
        select: { value: true },
      });
      if (!row) return allEnabled();

      const parsed = parseEnabled(row.value as Prisma.JsonValue);
      if (!parsed) {
        this.logger.warn(`Invalid SystemSetting '${KEY}' shape; falling back to all enabled`);
        return { ...allEnabled(), source: "error_fallback" };
      }
      return { enabledModules: parsed, source: "system_setting" };
    } catch (e) {
      this.logger.warn(
        `Failed to load SystemSetting '${KEY}'; falling back to all enabled: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return { ...allEnabled(), source: "error_fallback" };
    }
  }
}
