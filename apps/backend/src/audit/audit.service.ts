import { Injectable } from "@nestjs/common";
import type { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { computeAuditDiff } from "./audit-diff";
import { redactAuditValue } from "./audit-redaction";
import type { AuditLogPayload } from "./audit.types";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(payload: AuditLogPayload) {
    return this.prisma.auditLog.create({
      data: {
        entityType: payload.entityType,
        entityId: payload.entityId,
        action: payload.action,
        changedBy: payload.changedBy,
        changedByRole: payload.changedByRole ?? null,
        before: payload.before as Prisma.InputJsonValue | undefined,
        after: payload.after as Prisma.InputJsonValue | undefined,
        diff: payload.diff as Prisma.InputJsonValue | undefined,
        context: payload.context as Prisma.InputJsonValue | undefined,
      },
    });
  }

  buildUpdatePayload(input: {
    entityType: string;
    entityId: string;
    action?: AuditAction;
    changedBy: string;
    changedByRole?: string | null;
    before: unknown;
    after: unknown;
    context?: unknown;
  }): AuditLogPayload {
    const before = redactAuditValue(input.before);
    const after = redactAuditValue(input.after);
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action ?? "UPDATE",
      changedBy: input.changedBy,
      changedByRole: input.changedByRole ?? null,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
      diff: computeAuditDiff(before, after) as unknown as Prisma.InputJsonValue,
      context: (redactAuditValue(input.context) ?? null) as Prisma.InputJsonValue | null,
    };
  }

  async listForEntity(
    entityType: string,
    entityId: string,
    opts?: { page?: number; pageSize?: number; action?: AuditAction; changedBy?: string },
  ) {
    const page = Math.max(1, Number(opts?.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(opts?.pageSize ?? 50)));
    const skip = (page - 1) * pageSize;
    const where = {
      entityType,
      entityId,
      ...(opts?.action ? { action: opts.action } : {}),
      ...(opts?.changedBy ? { changedBy: opts.changedBy } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
