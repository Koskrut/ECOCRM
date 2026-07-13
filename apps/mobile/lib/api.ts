import { getApiBaseUrl } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function joinPath(base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const { token, headers: initHeaders, ...rest } = init ?? {};
  const headers = new Headers(initHeaders ?? undefined);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(joinPath(getApiBaseUrl(), path), {
    ...rest,
    headers,
  });

  const text = await res.text();
  let body: unknown = null;
  if (text.length) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    let message = `${res.status}`;
    if (body && typeof body === "object" && body !== null && "message" in body) {
      const m = (body as { message: unknown }).message;
      message = typeof m === "string" ? m : Array.isArray(m) ? m.join(", ") : JSON.stringify(body);
    } else if (typeof body === "string") {
      message = body;
    }
    throw new ApiError(res.status, message);
  }

  return body as T;
}

/** Multipart upload (do not set Content-Type — fetch adds boundary). */
export async function apiUploadForm<T>(
  path: string,
  formData: FormData,
  init?: { token?: string | null; method?: string },
): Promise<T> {
  const { token, method = "POST" } = init ?? {};
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(joinPath(getApiBaseUrl(), path), {
    method,
    headers,
    body: formData,
  });

  const text = await res.text();
  let body: unknown = null;
  if (text.length) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    let message = `${res.status}`;
    if (res.status === 413) {
      message = "Фото занадто велике. Спробуйте інше зображення або зробіть фото ближче.";
    } else if (body && typeof body === "object" && body !== null && "message" in body) {
      const m = (body as { message: unknown }).message;
      message = typeof m === "string" ? m : Array.isArray(m) ? m.join(", ") : JSON.stringify(body);
    } else if (typeof body === "string" && !body.includes("<html")) {
      message = body;
    }
    throw new ApiError(res.status, message);
  }

  return body as T;
}
