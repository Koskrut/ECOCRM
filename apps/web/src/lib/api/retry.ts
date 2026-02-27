import type { AxiosError } from "axios";

export function shouldRetry(error: AxiosError): boolean {
  if (!error.response) return true;
  const s = error.response.status;
  return s === 429 || s === 503 || s === 502 || s === 504;
}

export function retryDelay(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const sec = Number(retryAfterHeader);
    if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  }
  const base = Math.min(1000 * 2 ** (attempt - 1), 8000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}
