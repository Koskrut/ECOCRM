import type { AxiosError } from "axios";

export type ApiErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "SERVER"
  | "UNKNOWN";

export class ApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  details?: unknown;
  requestId?: string;

  constructor(opts: {
    message: string;
    code: ApiErrorCode;
    status?: number;
    details?: unknown;
    requestId?: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
    this.requestId = opts.requestId;
    this.cause = opts.cause;
  }
}

export function mapAxiosError(err: unknown): ApiError {
  const ax = err as AxiosError<unknown>;

  if (!ax || typeof ax !== "object" || !("isAxiosError" in ax)) {
    return new ApiError({ message: "Unknown error", code: "UNKNOWN", cause: err });
  }

  const status = ax.response?.status;
  const data = ax.response?.data;
  const requestId =
    ax.response?.headers?.["x-request-id"] ?? ax.response?.headers?.["x-correlation-id"];

  if (ax.code === "ECONNABORTED" || String(ax.message).toLowerCase().includes("timeout")) {
    return new ApiError({
      message: "Request timeout",
      code: "TIMEOUT",
      status,
      details: data,
      requestId,
      cause: err,
    });
  }

  if (!ax.response) {
    return new ApiError({
      message: "Network error",
      code: "NETWORK",
      details: { url: ax.config?.url, method: ax.config?.method },
      requestId,
      cause: err,
    });
  }

  const d = data as { message?: string | string[]; error?: string } | undefined;
  const backendMsg =
    (typeof d?.message === "string" && d.message) ||
    (Array.isArray(d?.message) && d.message.join(", ")) ||
    (typeof d?.error === "string" && d.error);

  const message = backendMsg || `Request failed (${status})`;

  const code: ApiErrorCode =
    status === 401
      ? "UNAUTHORIZED"
      : status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : status === 422
              ? "VALIDATION"
              : status === 429
                ? "RATE_LIMIT"
                : status && status >= 500
                  ? "SERVER"
                  : "UNKNOWN";

  return new ApiError({
    message,
    code,
    status,
    details: data,
    requestId,
    cause: err,
  });
}

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  NETWORK: "Немає з'єднання із сервером. Перевірте мережу та спробуйте ще раз.",
  TIMEOUT: "Сервер відповідає занадто довго. Спробуйте ще раз.",
  UNAUTHORIZED: "Сесію завершено. Увійдіть повторно.",
  FORBIDDEN: "Недостатньо прав для цієї дії.",
  NOT_FOUND: "Запитаний ресурс не знайдено.",
  VALIDATION: "Перевірте заповнення полів і повторіть спробу.",
  CONFLICT: "Операцію неможливо виконати через конфлікт даних.",
  RATE_LIMIT: "Забагато запитів. Спробуйте трохи пізніше.",
  SERVER: "Помилка сервера. Спробуйте ще раз пізніше.",
  UNKNOWN: "Не вдалося виконати запит. Спробуйте ще раз.",
};

export function getUserFriendlyApiError(error: unknown, fallback?: string): string {
  const mapped = mapAxiosError(error);
  if (mapped.code === "VALIDATION" && mapped.message) return mapped.message;
  if (mapped.code === "CONFLICT" && mapped.message) return mapped.message;
  if (mapped.code === "NOT_FOUND" && mapped.message) return mapped.message;
  return fallback ?? DEFAULT_MESSAGES[mapped.code] ?? DEFAULT_MESSAGES.UNKNOWN;
}
