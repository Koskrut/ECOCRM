import Constants from "expo-constants";

/** Base URL of NestJS CRM API (no trailing slash). */
export function getApiBaseUrl(): string {
  const extra =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
    (Constants.manifest2 as { extra?: { expoClient?: { extra?: { apiUrl?: string } } } } | undefined)
      ?.extra?.expoClient?.extra?.apiUrl;
  if (typeof extra === "string" && extra.trim()) {
    return extra.replace(/\/$/, "");
  }
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (typeof env === "string" && env.trim()) {
    return env.replace(/\/$/, "");
  }
  /** iOS simulator and web; Android emulator use 10.0.2.2 — set EXPO_PUBLIC_API_URL. */
  return "http://localhost:3001";
}
