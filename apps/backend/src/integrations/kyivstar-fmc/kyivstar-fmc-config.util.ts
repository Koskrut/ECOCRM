import { PrismaService } from "../../prisma/prisma.service";
import type { KyivstarFmcApiConfig } from "./kyivstar-fmc-api";
import { KYIVSTAR_FMC_PROVIDER } from "./kyivstar-fmc-ingest.service";

export type KyivstarFmcStoredConfig = {
  integratorId?: string;
  apiBaseUrl?: string;
  phonesToUserId?: Record<string, string>;
  defaultManagerId?: string;
  useWebhook?: boolean;
  usePolling?: boolean;
};

export async function loadKyivstarFmcApiConfig(
  prisma: PrismaService,
): Promise<{ cfg: KyivstarFmcApiConfig; stored: KyivstarFmcStoredConfig; isEnabled: boolean } | null> {
  const setting = await prisma.integrationSetting.findFirst({
    where: { provider: KYIVSTAR_FMC_PROVIDER },
  });
  if (!setting?.isEnabled) return null;

  const fmcToken = setting.apiToken ?? process.env.KYIVSTAR_FMC_TOKEN ?? null;
  const stored = (setting.config ?? null) as KyivstarFmcStoredConfig | null;
  const integratorId =
    stored?.integratorId?.trim() || process.env.KYIVSTAR_FMC_INTEGRATOR_ID?.trim() || null;
  if (!fmcToken || !integratorId) return null;

  return {
    isEnabled: true,
    stored: stored ?? {},
    cfg: {
      fmcToken,
      integratorId,
      apiBaseUrl: stored?.apiBaseUrl,
    },
  };
}

export function resolveOriginatorPhoneForUser(
  phonesToUserId: Record<string, string>,
  userId: string,
): string | null {
  for (const [phone, mappedUserId] of Object.entries(phonesToUserId)) {
    if (mappedUserId.trim() === userId.trim() && phone.trim()) {
      return phone.trim();
    }
  }
  return null;
}
