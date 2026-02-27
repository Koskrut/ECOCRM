import axios from "axios";
import axiosRetry from "axios-retry";
import { mapAxiosError } from "./errors";
import { retryDelay, shouldRetry } from "./retry";
import { unwrap } from "./transform";

export const apiHttp = axios.create({
  baseURL: "/api",
  timeout: 12_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

apiHttp.interceptors.response.use(
  (r) => r,
  (e) => Promise.reject(mapAxiosError(e)),
);

axiosRetry(apiHttp, {
  retries: 2,
  retryCondition: (error) => {
    const method = (error.config?.method || "get").toLowerCase();
    const idempotent = ["get", "head", "options"].includes(method);
    return idempotent && shouldRetry(error);
  },
  retryDelay: (retryCount, error) => {
    const ra = error.response?.headers?.["retry-after"] ?? null;
    return retryDelay(retryCount, ra);
  },
});

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const r = await apiHttp.get(url, { params });
  return unwrap<T>(r.data);
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const r = await apiHttp.post(url, data);
  return unwrap<T>(r.data);
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  const r = await apiHttp.patch(url, data);
  return unwrap<T>(r.data);
}

export async function apiDelete<T>(url: string): Promise<T> {
  const r = await apiHttp.delete(url);
  return unwrap<T>(r.data);
}
