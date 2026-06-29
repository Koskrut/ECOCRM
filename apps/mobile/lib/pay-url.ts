import Constants from "expo-constants";

/**
 * Base URL of CRM web app (apps/web) where `/pay/[token]` is served.
 * Priority: app.json extra.crmPayUrl → EXPO_PUBLIC_CRM_PAY_URL → dev localhost:3000.
 */
export function getCrmPayPageOrigin(): string {
  const fromExtra =
    (Constants.expoConfig?.extra as { crmPayUrl?: string } | undefined)?.crmPayUrl ??
    (
      Constants.manifest2 as
        | { extra?: { expoClient?: { extra?: { crmPayUrl?: string } } } }
        | undefined
    )?.extra?.expoClient?.extra?.crmPayUrl;
  if (typeof fromExtra === "string" && fromExtra.trim()) {
    return fromExtra.trim().replace(/\/+$/, "");
  }

  const env = process.env.EXPO_PUBLIC_CRM_PAY_URL;
  if (typeof env === "string" && env.trim()) {
    return env.trim().replace(/\/+$/, "");
  }

  if (__DEV__) {
    return "http://localhost:3000";
  }

  return "";
}

export function buildPublicPayUrl(publicToken: string): string | null {
  const base = getCrmPayPageOrigin();
  if (!base) return null;
  return `${base}/pay/${publicToken}`;
}
