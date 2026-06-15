import { apiHttp } from "../client";

export type AuditDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
};

export type AuditLogItem = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  changedBy: string;
  changedByRole?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: AuditDiffEntry[] | null;
  context?: unknown;
  createdAt: string;
};

export type AuditListResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditEntityType = "Contact" | "Company" | "Order" | "Lead";

export const auditApi = {
  listForEntity: (
    entityType: AuditEntityType,
    entityId: string,
    params?: { page?: number; pageSize?: number },
  ) =>
    apiHttp
      .get<AuditListResponse>(
        `/audit/${entityType}/${entityId}?page=${params?.page ?? 1}&pageSize=${params?.pageSize ?? 20}`,
      )
      .then((r) => r.data),
};
