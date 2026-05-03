/**
 * Typed helpers for metadata / system admin APIs (thin wrappers over apiHttp).
 */
import { apiHttp } from "@/lib/api/client";

export type SystemControlPlaneDto = {
  controlPlaneMode: boolean;
  installationId: string | null;
  controlPlaneUrlConfigured: boolean;
  tokenConfigured: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastHttpStatus: number | null;
  lastError: string | null;
};

export async function fetchControlPlaneTelemetry(): Promise<SystemControlPlaneDto> {
  const r = await apiHttp.get<SystemControlPlaneDto>("/system/control-plane");
  return r.data;
}

export async function fetchRuntimeLayouts(entityType: string, type = "CARD") {
  const r = await apiHttp.get<{ items?: unknown[] }>(
    `/layouts/runtime/list?entityType=${encodeURIComponent(entityType)}&type=${encodeURIComponent(type)}`,
  );
  return r.data?.items ?? [];
}
