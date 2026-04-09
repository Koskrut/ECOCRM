import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MODULES_ENABLED_V1_KEY } from "../modules/enabled/modules-enabled.constants";
import { normalizePilotExtensionEnabledList } from "../modules/enabled/pilot-extension-enabled.util";

@Injectable()
export class SystemModulesEnabledWriteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists only pilot extension ids (sorted). Does not store core.crm.
   */
  async setPilotExtensionsEnabled(enabled: readonly string[]): Promise<void> {
    let sorted: string[];
    try {
      sorted = normalizePilotExtensionEnabledList(enabled);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "DUPLICATE_IDS") {
        throw new BadRequestException("Duplicate module ids in enabled list");
      }
      if (code === "INVALID_ID") {
        throw new BadRequestException("Invalid module id in enabled list");
      }
      throw new BadRequestException("Invalid enabled list");
    }

    await this.prisma.systemSetting.upsert({
      where: { id: MODULES_ENABLED_V1_KEY },
      create: {
        id: MODULES_ENABLED_V1_KEY,
        value: { enabled: sorted },
      },
      update: {
        value: { enabled: sorted },
      },
    });
  }
}
