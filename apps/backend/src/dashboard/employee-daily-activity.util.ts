import { PRESENCE_ONLINE_THRESHOLD_MS } from "../presence/presence.constants";
import type {
  EmployeeDailyActivityRow,
  EmployeeDailyActivitySort,
  EmployeePresenceStatus,
} from "./employee-daily-activity.types";

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Audit entity types excluded from user action counts and main timeline. */
export const SYSTEM_AUDIT_ENTITY_TYPES = new Set([
  "UserActivitySession",
  "RiskPolicy",
  "MaterialReservation",
  "WorkflowExecutionLog",
  "WorkflowRule",
]);

export function parseActivityDateYmd(dateRaw: string | undefined, fallback: string): string {
  const trimmed = dateRaw?.trim();
  if (trimmed && DATE_YMD.test(trimmed)) return trimmed;
  if (trimmed) throw new Error("Invalid date; use YYYY-MM-DD");
  return fallback;
}

export function computePresenceStatus(
  lastSeenAt: Date | null,
  activeSeconds: number,
  now: Date,
): EmployeePresenceStatus {
  if (lastSeenAt && now.getTime() - lastSeenAt.getTime() < PRESENCE_ONLINE_THRESHOLD_MS) {
    return "online";
  }
  if (activeSeconds > 0 || lastSeenAt != null) return "was_today";
  return "absent";
}

export function overlapActiveSeconds(
  session: { startedAt: Date; lastSeenAt: Date; activeSeconds: number },
  from: Date,
  to: Date,
): number {
  const sessionStart = session.startedAt < from ? from : session.startedAt;
  const sessionEnd = session.lastSeenAt > to ? to : session.lastSeenAt;
  if (sessionEnd <= sessionStart) return 0;

  const overlapRatio =
    session.activeSeconds > 0
      ? Math.min(
          1,
          (sessionEnd.getTime() - sessionStart.getTime()) /
            Math.max(1, session.lastSeenAt.getTime() - session.startedAt.getTime()),
        )
      : 0;
  return Math.round(session.activeSeconds * overlapRatio);
}

export function classifyTaskTitle(title: string): "paymentControl" | "callback" | "other" {
  const lower = title.toLowerCase();
  if (
    lower.includes("контроль оплат") ||
    lower.includes("контроль оплати") ||
    lower.includes("payment control") ||
    lower.includes("risk playbook")
  ) {
    return "paymentControl";
  }
  if (lower.includes("перезвон") || lower.includes("callback") || lower.includes("передзвон")) {
    return "callback";
  }
  return "other";
}

export function isAuditNoise(entityType: string, changedBy: string | null | undefined): boolean {
  if (!changedBy || changedBy === "system") return true;
  return SYSTEM_AUDIT_ENTITY_TYPES.has(entityType);
}

export function auditLooksLikeTtnChange(after: unknown, diff: unknown): boolean {
  const blob = JSON.stringify({ after, diff }).toLowerCase();
  return (
    blob.includes("documentnumber") ||
    blob.includes("ttn") ||
    blob.includes("novaposhta") ||
    blob.includes("deliverydata")
  );
}

export function formatClientName(input: {
  contact?: { firstName?: string | null; lastName?: string | null } | null;
  company?: { name?: string | null } | null;
}): string | null {
  const contact = input.contact;
  if (contact) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
  }
  const companyName = input.company?.name?.trim();
  return companyName || null;
}

export function computeActionCount(row: Omit<EmployeeDailyActivityRow, "actionCount" | "systemSideEffectsCount">): number {
  return (
    row.payments.count +
    row.payments.matchAudits +
    row.orders.createdCount +
    row.orders.statusChangedCount +
    row.shipping.ttnCount +
    row.tasks.created +
    row.tasks.completed +
    row.crm.activities +
    row.crm.contacts +
    row.crm.companies +
    row.crm.leads +
    row.crm.visits
  );
}

export function sortActivityRows(
  rows: EmployeeDailyActivityRow[],
  sort: EmployeeDailyActivitySort,
): EmployeeDailyActivityRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "activeTime") {
      return b.presence.activeSeconds - a.presence.activeSeconds || a.fullName.localeCompare(b.fullName);
    }
    if (sort === "payments") {
      const sumA = Object.values(a.payments.amountsByCurrency).reduce((s, v) => s + v, 0);
      const sumB = Object.values(b.payments.amountsByCurrency).reduce((s, v) => s + v, 0);
      return sumB - sumA || b.payments.count - a.payments.count || a.fullName.localeCompare(b.fullName);
    }
    return b.actionCount - a.actionCount || a.fullName.localeCompare(b.fullName);
  });
  return copy;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
