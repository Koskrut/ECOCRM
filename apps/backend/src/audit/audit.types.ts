import type { AuditAction, Prisma } from "@prisma/client";

export type AuditActor = {
  id: string;
  role?: string | null;
};

export type AuditRequestContext = {
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  source?: string;
};

export type AuditLogPayload = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changedBy: string;
  changedByRole?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  diff?: Prisma.InputJsonValue | null;
  context?: Prisma.InputJsonValue | null;
};
