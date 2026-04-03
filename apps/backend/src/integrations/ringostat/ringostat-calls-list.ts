/**
 * Shared Ringostat /calls/list URL building + fetch + response parsing
 * (used by cron polling and historical backfill).
 */

export type RingostatCallsListConfig = {
  apiToken: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
  projectId?: string;
};

const CALLS_LIST_FIELDS = [
  "calldate",
  "caller",
  "callee",
  "src",
  "dst",
  "from",
  "to",
  "type",
  "direction",
  "call_direction",
  "call_type",
  "outbound_number",
  "uniqueid",
  "call_id",
  "id",
  "n_alias",
  "disposition",
  "billsec",
  "recording",
  "duration",
].join(",");

export function formatRingostatUtcParam(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
}

export function buildRingostatCallsListUrl(
  cfg: RingostatCallsListConfig,
  from: Date,
  to: Date,
): URL {
  const baseUrl =
    (cfg.apiBaseUrl && cfg.apiBaseUrl.trim().length > 0
      ? cfg.apiBaseUrl
      : process.env.RINGOSTAT_API_URL) ?? "https://api.ringostat.net";
  const endpoint =
    (cfg.pollingEndpoint && cfg.pollingEndpoint.trim().length > 0
      ? cfg.pollingEndpoint
      : "/calls/list") ?? "/calls/list";

  const base = new URL(baseUrl);
  const isCallsList =
    endpoint === "/calls/list" || endpoint === "calls/list" || endpoint.endsWith("calls/list");
  const useLegacyBase = isCallsList;
  const pathSegment = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = useLegacyBase
    ? new URL(`/${pathSegment}`, base.origin)
    : base.pathname !== "/" && base.pathname !== ""
      ? new URL(`${base.pathname.replace(/\/$/, "")}/${pathSegment}`, base.origin)
      : new URL(endpoint, baseUrl);

  url.searchParams.set("auth", cfg.apiToken);
  url.searchParams.set("export_type", "json");
  url.searchParams.set("from", formatRingostatUtcParam(from));
  url.searchParams.set("to", formatRingostatUtcParam(to));
  url.searchParams.set("fields", CALLS_LIST_FIELDS);
  if (cfg.projectId && cfg.projectId.trim().length > 0) {
    url.searchParams.set("project_id", cfg.projectId.trim());
  }
  return url;
}

export function parseRingostatCallsListPayload(payload: unknown): unknown[] {
  return (
    (Array.isArray(payload) && payload) ||
    (Array.isArray((payload as { results?: unknown[] }).results)
      ? (payload as { results: unknown[] }).results
      : [])
  );
}

export type RingostatCallsListFetchResult =
  | { ok: true; events: unknown[] }
  | { ok: false; status: number; bodySnippet: string };

export async function fetchRingostatCallsList(
  cfg: RingostatCallsListConfig,
  from: Date,
  to: Date,
): Promise<RingostatCallsListFetchResult> {
  const url = buildRingostatCallsListUrl(cfg, from, to);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Auth-key": cfg.apiToken,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, bodySnippet: text.slice(0, 500) };
  }

  const payload = (await res.json()) as unknown;
  return { ok: true, events: parseRingostatCallsListPayload(payload) };
}
