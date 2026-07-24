/**
 * Kyivstar Virtual Mobile PBX — Generic FMC API client.
 * @see https://fmc.kyivstar.ua/manual/genericfmcapi.yaml
 */

export const KYIVSTAR_FMC_DEFAULT_BASE_URL = "https://fmc.kyivstar.ua/api/fmc";

export type KyivstarFmcApiConfig = {
  fmcToken: string;
  integratorId: string;
  apiBaseUrl?: string;
};

export type KyivstarFmcCallHistoryItem = {
  call_id?: string;
  calling_number?: string;
  called_number?: string;
  start_datetime?: string;
  end_datetime?: string;
  call_duration?: number;
  record_id?: string | null;
  ringing?: number;
  direction?: "incoming" | "outgoing" | "local" | string;
  cause?: number;
};

export type KyivstarFmcCallHistoryFetchResult =
  | { ok: true; calls: KyivstarFmcCallHistoryItem[] }
  | { ok: false; status: number; bodySnippet: string };

export type KyivstarFmcCallRecordFetchResult =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; status: number; bodySnippet: string };

/** ISO 8601 local datetime without offset (Europe/Kyiv per vendor docs). */
export function formatKyivstarFmcQueryDatetime(d: Date): string {
  // hourCycle:"h23" avoids ICU hour=24 near midnight (hour12:false can emit 24:xx).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  let year = Number(pick("year"));
  let month = Number(pick("month"));
  let day = Number(pick("day"));
  let hour = Number(pick("hour"));
  const minute = pick("minute");
  const second = pick("second");
  // Belt-and-suspenders: some engines still emit 24 → roll to 00:00 next calendar day.
  if (hour >= 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${minute}:${second}`;
}

function resolveApiBase(cfg: KyivstarFmcApiConfig): string {
  const raw = (cfg.apiBaseUrl?.trim() || process.env.KYIVSTAR_FMC_API_BASE_URL || KYIVSTAR_FMC_DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
  return raw;
}

function buildAuthUrl(base: string, path: string, cfg: KyivstarFmcApiConfig): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${base}/`);
  url.searchParams.set("integrator_id", cfg.integratorId.trim());
  return url;
}

export function parseKyivstarCallHistoryPayload(payload: unknown): KyivstarFmcCallHistoryItem[] {
  if (!payload || typeof payload !== "object") return [];
  // Vendor OpenAPI samples use `Calls`; live /v1/callhistory returns `calls`.
  const obj = payload as { Calls?: unknown; calls?: unknown };
  const calls = Array.isArray(obj.calls) ? obj.calls : Array.isArray(obj.Calls) ? obj.Calls : null;
  if (!calls) return [];
  return calls.filter((c) => c && typeof c === "object") as KyivstarFmcCallHistoryItem[];
}

export async function fetchKyivstarCallHistory(
  cfg: KyivstarFmcApiConfig,
  from: Date,
  to: Date,
): Promise<KyivstarFmcCallHistoryFetchResult> {
  const base = resolveApiBase(cfg);
  const url = buildAuthUrl(base, "/v1/callhistory", cfg);
  url.searchParams.set("from", formatKyivstarFmcQueryDatetime(from));
  url.searchParams.set("to", formatKyivstarFmcQueryDatetime(to));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${cfg.fmcToken}`,
      Accept: "application/json",
    },
  });

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, bodySnippet: raw.slice(0, 500) };
  }

  let payload: unknown;
  try {
    payload = raw.trim() ? (JSON.parse(raw) as unknown) : { Calls: [] };
  } catch {
    return { ok: false, status: res.status, bodySnippet: `Expected JSON, got: ${raw.slice(0, 300)}` };
  }

  return { ok: true, calls: parseKyivstarCallHistoryPayload(payload) };
}

export async function fetchKyivstarCallRecord(
  cfg: KyivstarFmcApiConfig,
  recordId: string,
): Promise<KyivstarFmcCallRecordFetchResult> {
  const base = resolveApiBase(cfg);
  const url = buildAuthUrl(base, "/v1/callrecord", cfg);
  url.searchParams.set("record_id", recordId.trim());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${cfg.fmcToken}`,
      Accept: "audio/mpeg, application/json",
    },
  });

  if (!res.ok) {
    const raw = await res.text();
    return { ok: false, status: res.status, bodySnippet: raw.slice(0, 500) };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "audio/mpeg";
  return { ok: true, body: buf, contentType };
}

export type KyivstarFmcOriginateResult =
  | { ok: true; callControlId: string | null; raw: unknown }
  | { ok: false; status: number; bodySnippet: string };

export type KyivstarFmcCallControlResult =
  | { ok: true }
  | { ok: false; status: number; bodySnippet: string };

async function postKyivstarJson(
  cfg: KyivstarFmcApiConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; raw: string; payload: unknown }> {
  const base = resolveApiBase(cfg);
  const url = buildAuthUrl(base, path, cfg);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.fmcToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let payload: unknown = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = raw;
    }
  }
  return { ok: res.ok, status: res.status, raw, payload };
}

export async function postKyivstarOriginate(
  cfg: KyivstarFmcApiConfig,
  originator: string,
  destination: string,
): Promise<KyivstarFmcOriginateResult> {
  const res = await postKyivstarJson(cfg, "/v1/originate", { originator, destination });
  if (!res.ok) {
    return { ok: false, status: res.status, bodySnippet: res.raw.slice(0, 500) };
  }
  const callControlId =
    res.payload && typeof res.payload === "object" && res.payload !== null
      ? String((res.payload as { call_control_id?: unknown }).call_control_id ?? "").trim() || null
      : null;
  return { ok: true, callControlId, raw: res.payload };
}

export async function postKyivstarCallControl(
  cfg: KyivstarFmcApiConfig,
  callControlId: string,
  action: "clear",
): Promise<KyivstarFmcCallControlResult> {
  const res = await postKyivstarJson(cfg, "/v1/callcontrol", {
    call_control_id: callControlId,
    action,
  });
  if (!res.ok) {
    return { ok: false, status: res.status, bodySnippet: res.raw.slice(0, 500) };
  }
  return { ok: true };
}
