import { ConflictException } from "@nestjs/common";
import { OfficeToolsConfigService } from "./office-tools-config.service";

export const OFFICE_TOOLS_LEGACY_BLOCKED_MESSAGE =
  "Облік зараз йде через Office Tools. Завантаження Excel / Google Sheet вимкнено.";

export async function assertOfficeToolsInactiveForLegacyWrite(
  config: OfficeToolsConfigService,
): Promise<void> {
  if (await config.isActive()) {
    throw new ConflictException(OFFICE_TOOLS_LEGACY_BLOCKED_MESSAGE);
  }
}
