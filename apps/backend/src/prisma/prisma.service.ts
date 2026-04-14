import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { AuditAction, Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { computeAuditDiff } from "../audit/audit-diff";
import { getAuditContext } from "../audit/audit-context";
import { redactAuditValue } from "../audit/audit-redaction";

const AUDITED_ACTIONS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

function toEntityType(model: string): string {
  return model;
}

function toAuditAction(action: string): AuditAction {
  if (action.startsWith("create")) return "CREATE";
  if (action.startsWith("update")) return "UPDATE";
  if (action.startsWith("delete")) return "DELETE";
  return "UPDATE";
}

function containsRelationMutation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => containsRelationMutation(v));
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.some((k) => ["connect", "disconnect", "set", "connectOrCreate"].includes(k))) return true;
  return keys.some((k) => containsRelationMutation(obj[k]));
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractEntityId(value: unknown): string {
  const obj = asPlainObject(value);
  if (!obj) return "*";
  if (obj.id != null) return String(obj.id);
  if (obj.orderId != null) return String(obj.orderId);
  return "*";
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Set it in apps/backend/.env or run inside the backend container: docker compose -f docker-compose.prod.yml exec backend npm run bitrix:import"
      );
    }

    const pool = new Pool({
      connectionString,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      max: 20,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (err) => {
      console.warn("[PrismaService] pool connection error (client will be removed):", err.message);
    });
    const adapter = new PrismaPg(pool as any);

    super({ adapter });
    this.installAuditMiddleware();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private installAuditMiddleware(): void {
    const useMiddleware = (this as PrismaClient & {
      $use?: (cb: (params: any, next: (params: any) => Promise<any>) => Promise<any>) => void;
    }).$use;
    if (!useMiddleware) {
      console.warn("[PrismaService] Audit middleware not installed: Prisma $use is unavailable");
      return;
    }
    useMiddleware(async (params: any, next: (params: any) => Promise<any>) => {
      if (!params.model || params.model === "AuditLog" || !AUDITED_ACTIONS.has(params.action)) {
        return next(params);
      }

      const entityType = toEntityType(params.model);
      const delegate = (this as unknown as Record<string, unknown>)[
        `${params.model.charAt(0).toLowerCase()}${params.model.slice(1)}`
      ] as
        | {
            findUnique?: (args: unknown) => Promise<unknown>;
          }
        | undefined;
      const where = asPlainObject(params.args)?.where;

      let before: unknown = null;
      if (
        delegate?.findUnique &&
        (params.action === "update" ||
          params.action === "delete" ||
          params.action === "upsert")
      ) {
        try {
          before = await delegate.findUnique({ where });
        } catch {
          before = null;
        }
      }

      const result = await next(params);
      const data = asPlainObject(params.args)?.data;
      let action = toAuditAction(params.action);
      if (params.action.startsWith("update")) {
        const dataObj = asPlainObject(data);
        if (entityType === "Order" && dataObj && ("orderStage" in dataObj || "status" in dataObj)) {
          action = "STATUS_CHANGE";
        } else if (containsRelationMutation(dataObj)) {
          action = "RELATION_CHANGE";
        }
      }

      let after: unknown = null;
      if (params.action === "create" || params.action === "update" || params.action === "upsert") {
        after = result;
      }

      const context = getAuditContext();
      const changedBy = context?.actor.id ?? "system";
      const changedByRole = context?.actor.role ?? null;
      const entityId =
        extractEntityId(after) !== "*" ? extractEntityId(after) : extractEntityId(before);

      const beforeRedacted = redactAuditValue(before);
      const afterRedacted = redactAuditValue(after);
      const diff =
        action === "UPDATE" || action === "STATUS_CHANGE" || action === "RELATION_CHANGE"
          ? computeAuditDiff(beforeRedacted, afterRedacted)
          : null;

      const payload = {
        entityType,
        entityId,
        action,
        changedBy,
        changedByRole,
        before: beforeRedacted as Prisma.InputJsonValue | null,
        after: afterRedacted as Prisma.InputJsonValue | null,
        diff: diff as unknown as Prisma.InputJsonValue | null,
        context: (redactAuditValue(context?.request ?? null) ?? null) as Prisma.InputJsonValue | null,
      };

      await (this as any).auditLog.create({ data: payload });

      return result;
    });
  }
}
