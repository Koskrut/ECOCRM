import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MODULE_REGISTRY } from "../module-registry";
import type { ModuleId } from "../module-ids";
import { EnabledModulesProvider, type EnabledModulesState } from "./enabled-modules.provider";
import { MODULES_ENABLED_V1_KEY } from "./modules-enabled.constants";
import { moduleIdSetFromPilotStorage, parseStoredPilotExtensionIds } from "./pilot-extension-enabled.util";

function allEnabled(): EnabledModulesState {
  return {
    enabledModules: new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]),
    source: "default_all_enabled",
  };
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
        where: { id: MODULES_ENABLED_V1_KEY },
        select: { value: true },
      });
      if (!row) return allEnabled();

      const pilotIds = parseStoredPilotExtensionIds(row.value as Prisma.JsonValue);
      if (pilotIds === null) {
        this.logger.warn(
          `Invalid SystemSetting '${MODULES_ENABLED_V1_KEY}' shape; falling back to all enabled`,
        );
        return { ...allEnabled(), source: "error_fallback" };
      }
      return {
        enabledModules: moduleIdSetFromPilotStorage(pilotIds),
        source: "system_setting",
      };
    } catch (e) {
      this.logger.warn(
        `Failed to load SystemSetting '${MODULES_ENABLED_V1_KEY}'; falling back to all enabled: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return { ...allEnabled(), source: "error_fallback" };
    }
  }
}
