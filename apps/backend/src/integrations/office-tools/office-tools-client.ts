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

async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  fetchImpl: OfficeToolsHttpFetch = fetch,
): Promise<{ httpStatus: number; envelope: OfficeToolsEnvelope<T> }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  baseUrl: string,
  query: OfficeToolsListQuery,
  fetchImpl?: OfficeToolsHttpFetch,
): Promise<OfficeToolsComp[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsComp[]>(
    baseUrl,
    "comps/list",
    query,
    fetchImpl,
  );
  const result = assertProcessed(httpStatus, envelope, "comps/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsCreateComp(
  baseUrl: string,
  body: Record<string, unknown>,
  fetchImpl?: OfficeToolsHttpFetch,
): Promise<{ httpStatus: number; envelope: OfficeToolsEnvelope<OfficeToolsComp | OfficeToolsComp[]> }> {
  return postJson<OfficeToolsComp | OfficeToolsComp[]>(baseUrl, "comps/create", body, fetchImpl);
}

export async function officeToolsListRems(
  baseUrl: string,
  query: OfficeToolsListQuery,
  fetchImpl?: OfficeToolsHttpFetch,
): Promise<OfficeToolsRem[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsRem[]>(
    baseUrl,
    "rems/list",
    query,
    fetchImpl,
  );
  const result = assertProcessed(httpStatus, envelope, "rems/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsListCompRec(
  baseUrl: string,
  query: OfficeToolsListQuery,
  fetchImpl?: OfficeToolsHttpFetch,
): Promise<OfficeToolsCompRec[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsCompRec[]>(
    baseUrl,
    "comprec/list",
    query,
    fetchImpl,
  );
  const result = assertProcessed(httpStatus, envelope, "comprec/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsListCompBalans(
  baseUrl: string,
  query: OfficeToolsListQuery,
  fetchImpl?: OfficeToolsHttpFetch,
): Promise<OfficeToolsCompBalans[]> {
  const { httpStatus, envelope } = await postJson<OfficeToolsCompBalans[]>(
    baseUrl,
    "compbalans/list",
    query,
    fetchImpl,
  );
  const result = assertProcessed(httpStatus, envelope, "compbalans/list");
  return Array.isArray(result) ? result : [];
}

export async function officeToolsCreateAcc(
  baseUrl: string,
  body: OfficeToolsAccCreateBody,
  fetchImpl?: OfficeToolsHttpFetch,
): Promise<OfficeToolsAccCreateResult> {
  const { httpStatus, envelope } = await postJson<OfficeToolsAccCreateResult>(
    baseUrl,
    "acc/create",
    body,
    fetchImpl,
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
