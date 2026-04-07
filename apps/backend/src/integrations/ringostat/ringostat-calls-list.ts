/**
 * Shared Ringostat /calls/list URL building + fetch + response parsing
 * (used by cron polling and historical backfill).
 *
 * Auth: Ringostat docs use header `Auth-key` only. Do not pass `auth` in the query string —
 * Kong/nginx may reject the request (400/HTML) when combined with the header.
 */

export type RingostatCallsListConfig = {
  apiToken: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
  projectId?: string;
};

const CALLS_LIST_FIELDS_FALLBACK = [
  "calldate",
  "caller",
  "dst",
  "disposition",
  "billsec",
  "recording",
].join(",");

const CALLS_LIST_FIELDS_EXPANDED = [
  "uniqueid",
  // Call log export API uses call_type/instead of webhook "type".
  "call_type",
  "caller",
  "dst",
  "connected_with",
  // Number shown to a client during outgoing calls (manager line).
  "caller_number",
  // Employee identifier in call log (often internal extension-like number).
  "employee_number",
  // Additional number entered in IVR (often used as extension).
  "additional_number",
  "waittime",
  "duration",
  "duration_ms",
  "disposition",
  "billsec",
  "missing_reason",
  "proper_flag",
  "repeated_flag",
  "call_counter",
  "call_card",
  "scheme_name",
  "pool_name",
  "department",
  "employee_fio",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "has_recording",
  "recording",
  "recording_wav",
  "calldate",
].join(",");

export function formatRingostatUtcParam(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
}

export function buildRingostatCallsListUrl(
  cfg: RingostatCallsListConfig,
  from: Date,
  to: Date,
  fields: string = CALLS_LIST_FIELDS_FALLBACK,
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

  url.searchParams.set("export_type", "json");
  url.searchParams.set("from", formatRingostatUtcParam(from));
  url.searchParams.set("to", formatRingostatUtcParam(to));
  url.searchParams.set("fields", fields);
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
  | { ok: true; events: unknown[]; fieldsMode: "expanded" | "fallback" }
  | { ok: false; status: number; bodySnippet: string };

export async function fetchRingostatCallsList(
  cfg: RingostatCallsListConfig,
  from: Date,
  to: Date,
): Promise<RingostatCallsListFetchResult> {
  const isNonJsonResponse = (bodySnippet: string): boolean => {
    const s = (bodySnippet || "").trim().toLowerCase();
    if (!s) return false;
    if (s.startsWith("expected json, got:")) return true;
    if (s.includes("<html") || s.includes("<!doctype html")) return true;
    if (s.includes("bad fields") || s.includes("unknown field")) return true;
    return false;
  };

  const tryFetch = async (
    fieldsMode: "expanded" | "fallback",
  ): Promise<RingostatCallsListFetchResult> => {
    const fields =
      fieldsMode === "expanded" ? CALLS_LIST_FIELDS_EXPANDED : CALLS_LIST_FIELDS_FALLBACK;
    const url = buildRingostatCallsListUrl(cfg, from, to, fields);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Auth-key": cfg.apiToken,
      },
    });

    const raw = await res.text();

    if (!res.ok) {
      return { ok: false, status: res.status, bodySnippet: raw.slice(0, 500) };
    }

    let payload: unknown;
    if (raw.trim().length === 0) {
      payload = [];
    } else {
      try {
        payload = JSON.parse(raw) as unknown;
      } catch {
        return {
          ok: false,
          status: res.status,
          bodySnippet: `Expected JSON, got: ${raw.slice(0, 300)}`,
        };
      }
    }
    return { ok: true, events: parseRingostatCallsListPayload(payload), fieldsMode };
  };

  const expanded = await tryFetch("expanded");
  if (expanded.ok) return expanded;
  // Some Ringostat installs reject unknown fields in query (400),
  // and some return HTTP 200 with a non-JSON error/HTML body.
  if (expanded.status === 400) return tryFetch("fallback");
  if (expanded.status === 200 && isNonJsonResponse(expanded.bodySnippet)) return tryFetch("fallback");
  return expanded;
}
