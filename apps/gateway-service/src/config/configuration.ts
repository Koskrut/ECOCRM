export type GatewayProviderMode = "mock" | "kyivstar_openai";

/** Kyivstar telephony control plane: HTTP adapter (real) vs local timers (dev-only). */
export type KyivstarControlPlaneMode = "http" | "synthetic";

export interface AppConfig {
  port: number;
  logLevel: string;
  gatewayProviderMode: GatewayProviderMode;
  gatewayApiToken: string;
  gatewayDebugToken: string | null;
  crmWebhookSecret: string;
  crmWebhookTimeoutMs: number;
  crmWebhookRetryCount: number;
  crmWebhookRetryDelayMs: number;
  crmWebhookMaxBackoffMs: number;
  openaiApiKey: string;
  openaiRealtimeModel: string;
  openaiRealtimeVoice: string;
  kyivstarApiBaseUrl: string;
  kyivstarApiToken: string;
  kyivstarSipRealm: string;
  kyivstarSipUser: string;
  kyivstarSipPassword: string;
  kyivstarSipProxy: string;
  /** http = real REST control plane; synthetic = local timers (never use in pilot). */
  kyivstarControlPlaneMode: KyivstarControlPlaneMode;
  kyivstarHttpTimeoutMs: number;
  kyivstarHttpOutboundPath: string;
  /** Path template with `{callId}` placeholder, e.g. `/v1/calls/{callId}/status`. */
  kyivstarHttpStatusPathTemplate: string;
  /** Path template with `{callId}` placeholder, e.g. `/v1/calls/{callId}/hangup`. */
  kyivstarHttpHangupPathTemplate: string;
  kyivstarHttpHangupMethod: "POST" | "DELETE";
  /** Path template with `{callId}` for POST media attach. */
  kyivstarHttpMediaPathTemplate: string;
  rtpBindAddress: string;
  /** Public IP/host advertised to sip-adapter for RTP (defaults to RTP_BIND_ADDRESS). */
  rtpAdvertiseAddress: string;
  rtpPortStart: number;
  rtpPortEnd: number;
  openaiRealtimeWsUrl: string;
  openaiRealtimeSampleRateHz: number;
  callMaxDurationSec: number;
  callMaxTurns: number;
  realModeEnabled: boolean;
  realModePercent: number;
  /**
   * When true, real PSTN lifecycle requires destination E.164 to appear in `canaryAllowedE164Normalized`.
   * Use for first live pilots only; leave false for normal staged rollout.
   */
  canaryLiveCallsEnabled: boolean;
  /** Digits-only E.164 fragments (e.g. 380501112233) from env CANARY_ALLOWED_E164. */
  canaryAllowedE164Normalized: string[];
  /** Kyivstar HTTP auth: Bearer token (default) or API key header. */
  kyivstarHttpAuthStyle: "bearer" | "api_key";
  /** Header name when kyivstarHttpAuthStyle is api_key (e.g. X-Api-Key). */
  kyivstarHttpAuthHeaderName: string;
}

function req(name: string, fallback?: string): string {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env: ${name}`);
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

function optKyivstarControlPlaneMode(): KyivstarControlPlaneMode {
  const v = opt("KYIVSTAR_CONTROL_PLANE_MODE", "http").toLowerCase();
  return v === "synthetic" ? "synthetic" : "http";
}

function parseCanaryWhitelist(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.replace(/\D/g, ""))
    .filter((d) => d.length >= 8);
}

function optKyivstarAuthStyle(): "bearer" | "api_key" {
  const v = opt("KYIVSTAR_HTTP_AUTH_STYLE", "bearer").toLowerCase();
  return v === "api_key" || v === "apikey" ? "api_key" : "bearer";
}

export function loadConfiguration(): AppConfig {
  const modeRaw = opt("GATEWAY_PROVIDER_MODE", "mock");
  const gatewayProviderMode: GatewayProviderMode =
    modeRaw === "kyivstar_openai" ? "kyivstar_openai" : "mock";

  return {
    port: optInt("PORT", 3100),
    logLevel: opt("LOG_LEVEL", "info"),
    gatewayProviderMode,
    gatewayApiToken: req("GATEWAY_API_TOKEN", process.env.NODE_ENV === "test" ? "test-token" : ""),
    gatewayDebugToken: process.env.GATEWAY_DEBUG_TOKEN?.trim() || null,
    crmWebhookSecret: req("CRM_WEBHOOK_SECRET", process.env.NODE_ENV === "test" ? "test-webhook-secret" : ""),
    crmWebhookTimeoutMs: optInt("CRM_WEBHOOK_TIMEOUT_MS", 15_000),
    crmWebhookRetryCount: optInt("CRM_WEBHOOK_RETRY_COUNT", 4),
    crmWebhookRetryDelayMs: optInt("CRM_WEBHOOK_RETRY_DELAY_MS", 500),
    crmWebhookMaxBackoffMs: optInt("CRM_WEBHOOK_MAX_BACKOFF_MS", 8000),
    openaiApiKey: opt("OPENAI_API_KEY", ""),
    openaiRealtimeModel: opt("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview"),
    openaiRealtimeVoice: opt("OPENAI_REALTIME_VOICE", "alloy"),
    openaiRealtimeWsUrl: opt("OPENAI_REALTIME_WS_URL", "wss://api.openai.com/v1/realtime"),
    openaiRealtimeSampleRateHz: optInt("OPENAI_REALTIME_SAMPLE_RATE_HZ", 16_000),
    kyivstarApiBaseUrl: opt("KYIVSTAR_API_BASE_URL", ""),
    kyivstarApiToken: opt("KYIVSTAR_API_TOKEN", ""),
    kyivstarSipRealm: opt("KYIVSTAR_SIP_REALM", ""),
    kyivstarSipUser: opt("KYIVSTAR_SIP_USER", ""),
    kyivstarSipPassword: opt("KYIVSTAR_SIP_PASSWORD", ""),
    kyivstarSipProxy: opt("KYIVSTAR_SIP_PROXY", ""),
    kyivstarControlPlaneMode: optKyivstarControlPlaneMode(),
    kyivstarHttpTimeoutMs: optInt("KYIVSTAR_HTTP_TIMEOUT_MS", 15_000),
    kyivstarHttpOutboundPath: opt("KYIVSTAR_HTTP_OUTBOUND_PATH", "/v1/outbound/calls"),
    kyivstarHttpStatusPathTemplate: opt("KYIVSTAR_HTTP_STATUS_PATH_TEMPLATE", "/v1/calls/{callId}/status"),
    kyivstarHttpHangupPathTemplate: opt("KYIVSTAR_HTTP_HANGUP_PATH_TEMPLATE", "/v1/calls/{callId}/hangup"),
    kyivstarHttpHangupMethod: opt("KYIVSTAR_HTTP_HANGUP_METHOD", "POST").toUpperCase() === "DELETE" ? "DELETE" : "POST",
    kyivstarHttpMediaPathTemplate: opt(
      "KYIVSTAR_HTTP_MEDIA_PATH_TEMPLATE",
      "/v1/calls/{callId}/media",
    ),
    rtpBindAddress: opt("RTP_BIND_ADDRESS", "0.0.0.0"),
    rtpAdvertiseAddress: opt("RTP_ADVERTISE_ADDRESS", opt("RTP_BIND_ADDRESS", "0.0.0.0")),
    rtpPortStart: optInt("RTP_PORT_START", 30_000),
    rtpPortEnd: optInt("RTP_PORT_END", 30_999),
    callMaxDurationSec: optInt("CALL_MAX_DURATION_SEC", 180),
    callMaxTurns: optInt("CALL_MAX_TURNS", 6),
    realModeEnabled: opt("REAL_MODE_ENABLED", "false").toLowerCase() === "true",
    realModePercent: Math.max(0, Math.min(100, optInt("REAL_MODE_PERCENT", 0))),
    canaryLiveCallsEnabled: opt("CANARY_LIVE_CALLS_ENABLED", "false").toLowerCase() === "true",
    canaryAllowedE164Normalized: parseCanaryWhitelist(opt("CANARY_ALLOWED_E164", "")),
    kyivstarHttpAuthStyle: optKyivstarAuthStyle(),
    kyivstarHttpAuthHeaderName: opt("KYIVSTAR_HTTP_AUTH_HEADER_NAME", "X-Api-Key"),
  };
}
