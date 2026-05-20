import type { AppConfig } from "../config/configuration";

/** Replace `{callId}` placeholders in path templates. */
export function expandCallPath(template: string, providerCallId: string): string {
  return template.split("{callId}").join(encodeURIComponent(providerCallId));
}

export function joinBaseAndPath(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function buildKyivstarAuthHeaders(
  config: Pick<AppConfig, "kyivstarApiToken" | "kyivstarHttpAuthStyle" | "kyivstarHttpAuthHeaderName">,
): Record<string, string> {
  if (config.kyivstarHttpAuthStyle === "api_key") {
    const name = config.kyivstarHttpAuthHeaderName?.trim() || "X-Api-Key";
    return { [name]: config.kyivstarApiToken };
  }
  return { Authorization: `Bearer ${config.kyivstarApiToken}` };
}

export async function kyivstarHttpJson(
  config: Pick<
    AppConfig,
    | "kyivstarApiBaseUrl"
    | "kyivstarApiToken"
    | "kyivstarHttpTimeoutMs"
    | "kyivstarHttpAuthStyle"
    | "kyivstarHttpAuthHeaderName"
  >,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const url = joinBaseAndPath(config.kyivstarApiBaseUrl, path);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.kyivstarHttpTimeoutMs);
  try {
    const auth = buildKyivstarAuthHeaders(config);
    const res = await fetch(url, {
      method,
      headers: {
        ...auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

const CALL_ID_KEYS = [
  "callId",
  "id",
  "providerCallId",
  "call_id",
  "externalCallId",
  "connectionId",
  "uuid",
  "resourceId",
  "legId",
  "sipCallId",
  "telephonyCallId",
] as const;

function readStringOrNumberId(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Best-effort extraction — real B2B shapes vary; unknown layouts are logged by the provider.
 * Depth-limited recursion for nested `result` / `data` / `payload` / `call` objects.
 */
export function extractOutboundCallId(json: unknown, depth = 0): { callId: string; sessionId?: string } | null {
  if (depth > 5 || !json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;

  for (const k of CALL_ID_KEYS) {
    const id = readStringOrNumberId(o[k]);
    if (id) return { callId: id, sessionId: extractSessionId(o) };
  }

  const nestedKeys = ["result", "data", "payload", "call", "body", "response", "resource"] as const;
  for (const nk of nestedKeys) {
    const inner = o[nk];
    if (inner && typeof inner === "object") {
      const r = extractOutboundCallId(inner, depth + 1);
      if (r) return { callId: r.callId, sessionId: r.sessionId ?? extractSessionId(o) };
    }
  }

  return null;
}

function extractSessionId(o: Record<string, unknown>): string | undefined {
  for (const k of ["sessionId", "session_id", "providerSessionId", "externalSessionId", "sipSessionId"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export type ExtractedAttachMedia = {
  symmetricRtp: boolean;
  remoteAddress?: string;
  remotePort?: number;
  codec?: "alaw" | "mulaw";
};

/** Parse POST /media response from sip-adapter (or compatible B2B). */
export function extractAttachMediaResponse(json: unknown): ExtractedAttachMedia | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const symmetricRtp = o.symmetricRtp === true;
  const rtp = o.rtp;
  if (rtp && typeof rtp === "object") {
    const r = rtp as Record<string, unknown>;
    const remoteAddress = typeof r.remoteAddress === "string" ? r.remoteAddress.trim() : undefined;
    const remotePort =
      typeof r.remotePort === "number" && Number.isFinite(r.remotePort) ? r.remotePort : undefined;
    const codecRaw = typeof r.codec === "string" ? r.codec.trim().toLowerCase() : "";
    const codec = codecRaw === "alaw" || codecRaw === "mulaw" ? codecRaw : undefined;
    return { symmetricRtp, remoteAddress, remotePort, codec };
  }
  return { symmetricRtp };
}
