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

// ----- Layouts (admin) -----

export type LayoutFieldDto = {
  id: string;
  key: string;
  fieldKey: string | null;
  customFieldDefinitionId: string | null;
  customFieldDefinition?: {
    id: string;
    key: string;
    label: string;
    type: string;
    entityType: string;
  } | null;
  label: string | null;
  sortOrder: number;
  hidden: boolean;
  width: string | null;
  settings?: unknown;
};

export type LayoutSectionDto = {
  id: string;
  key: string;
  title: string;
  sortOrder: number;
  columns: number;
  fields: LayoutFieldDto[];
};

export type LayoutDto = {
  id: string;
  entityType: string;
  type: string;
  key: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  sections: LayoutSectionDto[];
};

export async function ensureListDefaultLayout(entityType: string): Promise<LayoutDto> {
  const r = await apiHttp.post<{ layout: LayoutDto }>(
    `/layouts/list-default/${encodeURIComponent(entityType)}`,
    {},
  );
  return r.data.layout;
}

export async function addLayoutField(
  layoutId: string,
  sectionId: string,
  body: {
    fieldKey?: string | null;
    customFieldDefinitionId?: string | null;
    label?: string | null;
    sortOrder?: number;
    hidden?: boolean;
    width?: string | null;
  },
): Promise<LayoutFieldDto> {
  const r = await apiHttp.post<{ field: LayoutFieldDto }>(
    `/layouts/${encodeURIComponent(layoutId)}/sections/${encodeURIComponent(sectionId)}/fields`,
    body,
  );
  return r.data.field;
}

export async function updateLayoutField(
  layoutId: string,
  sectionId: string,
  fieldId: string,
  body: {
    label?: string | null;
    sortOrder?: number;
    hidden?: boolean;
    width?: string | null;
  },
): Promise<LayoutFieldDto> {
  const r = await apiHttp.patch<{ field: LayoutFieldDto }>(
    `/layouts/${encodeURIComponent(layoutId)}/sections/${encodeURIComponent(sectionId)}/fields/${encodeURIComponent(fieldId)}`,
    body,
  );
  return r.data.field;
}

export async function removeLayoutField(
  layoutId: string,
  sectionId: string,
  fieldId: string,
): Promise<void> {
  await apiHttp.delete(
    `/layouts/${encodeURIComponent(layoutId)}/sections/${encodeURIComponent(sectionId)}/fields/${encodeURIComponent(fieldId)}`,
  );
}

// ----- Custom field values (batch) -----

export type CustomFieldBatchResponse = {
  byEntityId: Record<string, Record<string, unknown>>;
  definitions: Array<{ id: string; key: string; type: string }>;
};

export async function batchCustomFieldValues(
  entityType: string,
  entityIds: string[],
  definitionKeys?: string[],
): Promise<CustomFieldBatchResponse> {
  if (entityIds.length === 0) {
    return { byEntityId: {}, definitions: [] };
  }
  const r = await apiHttp.post<CustomFieldBatchResponse>("/custom-fields/values/batch", {
    entityType,
    entityIds,
    definitionKeys,
  });
  return r.data;
}
