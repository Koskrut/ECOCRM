export type FreeswitchMode = "mock" | "esl";

export interface AppConfig {
  port: number;
  logLevel: string;
  apiToken: string;
  freeswitchMode: FreeswitchMode;
  freeswitchEslHost: string;
  freeswitchEslPort: number;
  freeswitchEslPassword: string;
  sipProviderHost: string;
  sipProviderPort: number;
  sipPublicIp: string;
  sipPublicPort: number;
  sipTrunkUser: string;
  sipTrunkPassword: string;
  sipCliNumber: string;
  sipGatewayName: string;
  sipDialPrefix: string;
}

function opt(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function optInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfiguration(): AppConfig {
  const mode = opt("FREESWITCH_MODE", "mock").toLowerCase();
  return {
    port: optInt("PORT", 8080),
    logLevel: opt("LOG_LEVEL", "info"),
    apiToken: opt("SIP_ADAPTER_API_TOKEN", process.env.NODE_ENV === "test" ? "test-token" : ""),
    freeswitchMode: mode === "esl" ? "esl" : "mock",
    freeswitchEslHost: opt("FREESWITCH_ESL_HOST", "127.0.0.1"),
    freeswitchEslPort: optInt("FREESWITCH_ESL_PORT", 8021),
    freeswitchEslPassword: opt("FREESWITCH_ESL_PASSWORD", "ClueCon"),
    sipProviderHost: opt("SIP_PROVIDER_HOST", "94.153.248.113"),
    sipProviderPort: optInt("SIP_PROVIDER_PORT", 5060),
    sipPublicIp: opt("SIP_PUBLIC_IP", "127.0.0.1"),
    sipPublicPort: optInt("SIP_PUBLIC_PORT", 5060),
    sipTrunkUser: opt("SIP_TRUNK_USER", ""),
    sipTrunkPassword: opt("SIP_TRUNK_PASSWORD", ""),
    sipCliNumber: opt("SIP_CLI_NUMBER", "0897202582"),
    sipGatewayName: opt("SIP_GATEWAY_NAME", "provider"),
    sipDialPrefix: opt("SIP_DIAL_PREFIX", ""),
  };
}
