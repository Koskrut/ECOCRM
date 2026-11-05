/**
 * Public CRM origin for `/pay/{token}`. Telegram url-buttons require HTTPS.
 * Prefer store setting `crmPayPageUrl`, then CRM_WEB_URL / WEB_ORIGIN.
 */
export function resolvePublicPayPageOrigin(
  crmPayPageUrl?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const candidates = [crmPayPageUrl, env.CRM_WEB_URL, env.WEB_ORIGIN];
  for (const raw of candidates) {
    const base = (raw ?? "").trim().replace(/\/+$/, "");
    if (/^https:\/\//i.test(base)) return base;
  }
  return null;
}

export function absolutePayUrl(payPath: string, origin: string): string {
  const path = payPath.startsWith("/") ? payPath : `/${payPath}`;
  return `${origin}${path}`;
}
