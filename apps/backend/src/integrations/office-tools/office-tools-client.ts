import {
  OfficeToolsApiError,
  type OfficeToolsAccCreateBody,
  type OfficeToolsAccCreateResult,
  type OfficeToolsComp,
  type OfficeToolsCompBalans,
  type OfficeToolsCompRec,
  type OfficeToolsEnvelope,
  type OfficeToolsListQuery,
  type OfficeToolsRem,
} from "./office-tools.types";

export type OfficeToolsHttpFetch = typeof fetch;

export type OfficeToolsRequestContext = {
  baseUrl: string;
  /** Sent as X-API-Key on every request when set. */
  apiKey?: string | null;
  fetchImpl?: OfficeToolsHttpFetch;
};

async function postJson<T>(
  ctx: OfficeToolsRequestContext,
  path: string,
  body: unknown,
): Promise<{ httpStatus: number; envelope: OfficeToolsEnvelope<T> }> {
  const url = `${ctx.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = ctx.apiKey?.trim();
  if (apiKey) headers["X-API-Key"] = apiKey;

  const fetchImpl = ctx.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new OfficeToolsApiError(
      `Office Tools returned non-JSON (${res.status}) for ${path}`,
      res.status,
      text.slice(0, 500),
    );
  }
  const envelope = parsed as OfficeToolsEnvelope<T>;
  return { httpStatus: res.status, envelope };
}

export function assertProcessed<T>(
  httpStatus: number,
  envelope: OfficeToolsEnvelope<T>,
  path: string,
): T {
  if (httpStatus === 422 || envelope.status === "failed") {
    throw new OfficeToolsApiError(
      envelope.error || `Office Tools failed at ${path}`,
      httpStatus === 200 ? 422 : httpStatus,
      envelope,
    );
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    throw new OfficeToolsApiError(
      envelope.error || `Office Tools HTTP ${httpStatus} at ${path}`,
      httpStatus,
      envelope,
    );
  }
  if (envelope.status && envelope.status !== "processed") {
    throw new OfficeToolsApiError(
      envelope.error || `Office Tools status ${envelope.status} at ${path}`,
      httpStatus,
      envelope,
    );
  }
  return envelope.result as T;
}

export async function officeToolsListComps(
  ctx: OfficeToolsRequestContext,
  query: OfficeToolsListQuery,
): Promise<OfficeToolsComp[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsComp[]>(ctx, "comps/list", query);
  const result = assertProcessed(httpStatus, envelope, "comps/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsCreateComp(
  ctx: OfficeToolsRequestContext,
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; envelope: OfficeToolsEnvelope<OfficeToolsComp | OfficeToolsComp[]> }> {
  return postJson<OfficeToolsComp | OfficeToolsComp[]>(ctx, "comps/create", body);
}

export async function officeToolsListRems(
  ctx: OfficeToolsRequestContext,
  query: OfficeToolsListQuery,
): Promise<OfficeToolsRem[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsRem[]>(ctx, "rems/list", query);
  const result = assertProcessed(httpStatus, envelope, "rems/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsListCompRec(
  ctx: OfficeToolsRequestContext,
  query: OfficeToolsListQuery,
): Promise<OfficeToolsCompRec[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsCompRec[]>(ctx, "comprec/list", query);
  const result = assertProcessed(httpStatus, envelope, "comprec/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsListCompBalans(
  ctx: OfficeToolsRequestContext,
  query: OfficeToolsListQuery,
): Promise<OfficeToolsCompBalans[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsCompBalans[]>(
    ctx,
    "compbalans/list",
    query,
  );
  const result = assertProcessed(httpStatus, envelope, "compbalans/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsCreateAcc(
  ctx: OfficeToolsRequestContext,
  body: OfficeToolsAccCreateBody,
): Promise<OfficeToolsAccCreateResult> {
  const { httpStatus, envelope } = await postJson<OfficeToolsAccCreateResult>(
    ctx,
    "acc/create",
    body,
  );
  return assertProcessed(httpStatus, envelope, "acc/create") ?? {};
}

/** Paginate list endpoints until a short page. */
export async function officeToolsListAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 500,
  maxPages = 200,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const chunk = await fetchPage(page * pageSize, pageSize);
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}
