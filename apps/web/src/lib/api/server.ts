import axios from "axios";
import axiosRetry from "axios-retry";
import { API_URL } from "./config";
import { mapAxiosError } from "./errors";
import { retryDelay, shouldRetry } from "./retry";

export const backendHttp = axios.create({
  baseURL: API_URL,
  timeout: 12_000,
  headers: { "Content-Type": "application/json" },
});

backendHttp.interceptors.response.use(
  (r) => r,
  (e) => Promise.reject(mapAxiosError(e)),
);

axiosRetry(backendHttp, {
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
