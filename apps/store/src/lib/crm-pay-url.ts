/**
 * Базовий URL CRM (Next `apps/web`), де відкривається `/pay/[token]`.
 * Пріоритет: `crmPayPageUrl` з GET /store/config (Налаштування CRM → Інтернет-магазин) →
 * NEXT_PUBLIC_CRM_PAY_URL → у development `http://localhost:3000`.
 */
export function getCrmPayPageOrigin(crmPayPageUrlFromConfig?: string | null): string {
  const fromConfig = crmPayPageUrlFromConfig?.trim().replace(/\/+$/, "");
  if (fromConfig) return fromConfig;

  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CRM_PAY_URL?.replace(/\/+$/, "") : undefined;
  if (fromEnv) return fromEnv;

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return "";
}

export function buildPublicPayUrl(payPath: string, crmPayPageUrlFromConfig?: string | null): string | null {
  const base = getCrmPayPageOrigin(crmPayPageUrlFromConfig);
  if (!base) return null;
  const path = payPath.startsWith("/") ? payPath : `/${payPath}`;
  return `${base}${path}`;
}
