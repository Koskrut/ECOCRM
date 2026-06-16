import type { AuditAction, Prisma, PrismaClient } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { computeAuditDiff } from "./audit-diff";
import { getAuditContext } from "./audit-context";
import { redactAuditValue } from "./audit-redaction";

const AUDITED_ACTIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

const BULK_ACTIONS = new Set(["createMany", "createManyAndReturn", "updateMany", "deleteMany"]);

let auditPrismaClient: PrismaClient | null = null;

/** Base PrismaClient (without audit extension) — set before `$extends(auditExtension)`. */
export function setAuditPrismaClient(client: PrismaClient): void {
  auditPrismaClient = client;
}

function getAuditPrismaClient(): PrismaClient {
  if (!auditPrismaClient) {
    throw new Error("[auditExtension] Prisma client not initialized — call setAuditPrismaClient before $extends");
  }
  return auditPrismaClient;
}

function toAuditAction(operation: string): AuditAction {
  if (operation.startsWith("create")) return "CREATE";
  if (operation.startsWith("update")) return "UPDATE";
  if (operation.startsWith("delete")) return "DELETE";
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

function extractEntityIdFromWhere(where: unknown): string | null {
  const obj = asPlainObject(where);
  if (!obj) return null;
  if (obj.id != null) return String(obj.id);
  return null;
}

function modelDelegateName(model: string): string {
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
}

function bulkResultCount(result: unknown): number | null {
  if (Array.isArray(result)) return result.length;
  const obj = asPlainObject(result);
  if (obj && typeof obj.count === "number") return obj.count;
  return null;
}

type QueryArgs = {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

// Object-form defineExtension — callback form breaks model delegates in Prisma 7 (`.user` is undefined).
export const auditExtension = PrismaNamespace.defineExtension({
  name: "crm-audit",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: QueryArgs) {
        if (
          !model ||
          model === "AuditLog" ||
          !AUDITED_ACTIONS.has(operation) ||
          getAuditContext()?.skipAudit
        ) {
          return query(args);
        }

        const client = getAuditPrismaClient();
        const entityType = model;
        const argsObj = args as Record<string, unknown>;
        const where = argsObj?.where;
        const data = argsObj?.data;
        const isBulk = BULK_ACTIONS.has(operation);

        let before: unknown = null;
        if (
          !isBulk &&
          (operation === "update" || operation === "delete" || operation === "upsert")
        ) {
          const delegate = (client as unknown as Record<string, unknown>)[modelDelegateName(model)] as
            | { findUnique?: (findArgs: unknown) => Promise<unknown> }
            | undefined;
          if (delegate?.findUnique && where) {
            try {
              before = await delegate.findUnique({ where });
            } catch {
              before = null;
            }
          }
        }

        const result = await query(args);

        let action = toAuditAction(operation);
        if (operation.startsWith("update")) {
          const dataObj = asPlainObject(data);
          if (entityType === "Order" && dataObj && ("orderStage" in dataObj || "status" in dataObj)) {
            action = "STATUS_CHANGE";
          } else if (containsRelationMutation(dataObj)) {
            action = "RELATION_CHANGE";
          }
        }

        let after: unknown = null;
        let entityId: string;
        let diff: ReturnType<typeof computeAuditDiff> | null = null;
        let beforeRedacted: unknown = null;
        let afterRedacted: unknown = null;

        if (isBulk) {
          entityId = extractEntityIdFromWhere(where) ?? "bulk";
          after = {
            operation,
            model: entityType,
            where: redactAuditValue(where),
            count: bulkResultCount(result),
          };
          afterRedacted = after;
        } else {
          if (operation === "create" || operation === "update" || operation === "upsert") {
            after = result;
          }
          entityId =
            extractEntityId(after) !== "*" ? extractEntityId(after) : extractEntityId(before);
          beforeRedacted = redactAuditValue(before);
          afterRedacted = redactAuditValue(after);
          if (action === "UPDATE" || action === "STATUS_CHANGE" || action === "RELATION_CHANGE") {
            diff = computeAuditDiff(beforeRedacted, afterRedacted);
          }
        }

        const context = getAuditContext();
        const payload = {
          entityType,
          entityId,
          action,
          changedBy: context?.actor.id ?? "system",
          changedByRole: context?.actor.role ?? null,
          before: (beforeRedacted ?? null) as Prisma.InputJsonValue | null,
          after: (afterRedacted ?? null) as Prisma.InputJsonValue | null,
          diff: (diff ?? null) as unknown as Prisma.InputJsonValue | null,
          context: (redactAuditValue(context?.request ?? null) ?? null) as Prisma.InputJsonValue | null,
        };

        await client.auditLog.create({
          data: payload as any,
        });

        return result;
      },
    },
  },
});
