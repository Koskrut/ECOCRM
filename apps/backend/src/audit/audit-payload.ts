import type { AuditAction, Prisma } from "@prisma/client";
import { computeAuditDiff } from "./audit-diff";
import { redactAuditValue } from "./audit-redaction";

/** High-churn sync tables — never write AuditLog rows. */
export const AUDIT_SKIP_MODELS = new Set([
  "NpWarehouse",
  "NpStreet",
  "NpCity",
  "OrderTtn",
  "ProductWarehouseStock",
  "IntegrationSyncState",
]);

/** Fields that inflate Order rows without value in change history UI. */
const ORDER_DIFF_NOISE_FIELDS = new Set([
  "legacyRaw",
  "syncedAt",
  "updatedAt",
  "createdAt",
  "lastNpStatusSyncAt",
]);

export type AuditDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
};

export type BuiltAuditPayload = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changedBy: string;
  changedByRole: string | null;
  before: Prisma.InputJsonValue | null;
  after: Prisma.InputJsonValue | null;
  diff: Prisma.InputJsonValue | null;
  context: Prisma.InputJsonValue | null;
};

function filterOrderDiff(diff: AuditDiffEntry[]): AuditDiffEntry[] {
  return diff.filter((entry) => {
    const root = entry.field.split(".")[0] ?? entry.field;
    return !ORDER_DIFF_NOISE_FIELDS.has(root) && !ORDER_DIFF_NOISE_FIELDS.has(entry.field);
  });
}

/**
 * Order stores only field-level diff (no full before/after snapshots).
 * CREATE/DELETE use {} as the empty side so computeAuditDiff yields per-field entries.
 */
export function buildOrderAuditSnapshots(
  action: AuditAction,
  beforeRedacted: unknown,
  afterRedacted: unknown,
): {
  before: null;
  after: null;
  diff: AuditDiffEntry[] | null;
} {
  const empty = {};
  let raw: AuditDiffEntry[];
  if (action === "CREATE") {
    raw = computeAuditDiff(empty, afterRedacted ?? empty);
  } else if (action === "DELETE") {
    raw = computeAuditDiff(beforeRedacted ?? empty, empty);
  } else {
    raw = computeAuditDiff(beforeRedacted ?? empty, afterRedacted ?? empty);
  }
  const diff = filterOrderDiff(raw);
  return { before: null, after: null, diff: diff.length > 0 ? diff : null };
}

export function shouldSkipAuditModel(model: string | undefined | null): boolean {
  if (!model) return true;
  if (model === "AuditLog") return true;
  return AUDIT_SKIP_MODELS.has(model);
}

export function buildAuditLogPayload(input: {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changedBy: string;
  changedByRole?: string | null;
  beforeRedacted: unknown;
  afterRedacted: unknown;
  diff: AuditDiffEntry[] | null;
  context?: unknown;
}): BuiltAuditPayload {
  const context = (redactAuditValue(input.context ?? null) ?? null) as Prisma.InputJsonValue | null;

  if (input.entityType === "Order") {
    const snapshots = buildOrderAuditSnapshots(
      input.action,
      input.beforeRedacted,
      input.afterRedacted,
    );
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changedBy: input.changedBy,
      changedByRole: input.changedByRole ?? null,
      before: snapshots.before,
      after: snapshots.after,
      diff: (snapshots.diff ?? null) as unknown as Prisma.InputJsonValue | null,
      context,
    };
  }

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    changedBy: input.changedBy,
    changedByRole: input.changedByRole ?? null,
    before: (input.beforeRedacted ?? null) as Prisma.InputJsonValue | null,
    after: (input.afterRedacted ?? null) as Prisma.InputJsonValue | null,
    diff: (input.diff ?? null) as unknown as Prisma.InputJsonValue | null,
    context,
  };
}

export function resolveAuditRetentionDays(raw: string | undefined): number {
  const parsed = Number(raw ?? "90");
  if (!Number.isFinite(parsed)) return 90;
  return Math.min(90, Math.max(30, Math.trunc(parsed)));
}
