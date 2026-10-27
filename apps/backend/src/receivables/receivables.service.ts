import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActivityType,
  ConversationChannel,
  Prisma,
  ReceivablesReconcileStatus,
  TaskStatus,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import {
  AnalyticsScopeService,
  type AnalyticsScope,
} from "../analytics/analytics-scope.service";
import {
  computeOrderExchangeRate,
  getBaseCurrency,
  paymentToBase,
  toBaseCurrency,
  toUsd,
} from "../common/currency.util";
import { safeNum } from "../analytics/utils/analytics-currency.util";
import { normalizePagination } from "../common/pagination";
import { todayYmdKyiv } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import {
  RECEIVABLES_1C_ALLOWED_CURRENCIES,
  RECEIVABLES_1C_AMOUNT_CURRENCY,
  RECEIVABLES_COMMENT_STALE_DAYS,
  RECEIVABLES_COMMENT_TITLE,
  RECEIVABLES_DELTA_TOLERANCE,
  type Receivables1CCurrency,
} from "./receivables.constants";
import {
  aggregateReceivablesRows,
  normalizeCounterpartyCode1C,
  parseReceivablesExcel,
} from "./receivables-excel.parser";
import { financialOverdueWhere, isDebtOverdueByDueDate } from "../orders/order-status-sync.mapper";
import { aggregateClientFinance } from "../finance/client-finance";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../crm-timezone";
import {
  formatDebtCommentTitle,
  isDelayReasonCode,
  isPromiseBroken,
  isPromiseForYmd,
  parseDebtCommentTitle,
} from "./debt-promise.util";
import {
  agingBucketLabel,
  buildAgingBuckets,
  isAgingBucketLabel,
  RECEIVABLES_AGING_BUCKET_LABELS,
  RECEIVABLES_AGING_BUCKET_RANGES,
  type AgingOverdueOrder,
  type ReceivablesAgingBucketLabel,
} from "./receivables-aging.util";
import {
  activeSnoozeYmd,
  computeSnoozeUntilYmd,
  formatSnoozeActivityTitle,
  snoozeYmdToDbDate,
} from "./receivables-snooze.util";
import {
  compareWorkClients,
  matchesWorkClientQuery,
  parseWorkClientsSort,
} from "./receivables-work-clients.util";
import {
  buildBitrixLegacyDebtOrderWhere,
  buildOperationalDebtOrderWhere,
  buildOverdueDebtOrderWhere,
  buildReceivablesDebtOrderWhere,
  buildReceivablesPositiveDebtOrderWhere,
  computeReconcileStatus,
  isReceivablesDeltaStatus,
} from "./receivables-scope.util";
import {
  amountsMatchForReuse,
  buildFullDebtPayPurpose,
  computeFullDebtPayAmountUah,
  pickPayLinkAnchorOrder,
} from "./receivables-full-debt-pay-link.util";
import { ConversationsService } from "../integrations/telegram/conversations.service";
import { effectivePaymentRequestStatus } from "../payment-requests/payment-request-public.mapper";
import { PaymentRequestsService } from "../payment-requests/payment-requests.service";

type ContactDebtRow = {
  contactId: string;
  externalCode: string;
  debtBase: number;
  overdueBase: number;
  creditBase: number;
  orderCount: number;
  ownerId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  lastPaymentAt: Date | null;
  overdueDays: number;
  primaryOrderId: string | null;
  primaryOverdue: boolean;
  primaryDebt: number;
  overdueOrders: AgingOverdueOrder[];
};

type ContactDebtMap = Map<string, ContactDebtRow>;

const CONTACT_DEBT_CACHE_TTL_MS = 5_000;
const CALL_TASK_TITLE_PREFIX = "Дзвінок: дебіторка";

/** Order money fields are in the order currency. Callers convert to the base currency. */
function orderStoredAmount(value: unknown): number {
  return safeNum(value);
}

function isOrderOverdueByDueDate(
  paymentDueDate: Date | null | undefined,
  debtAmount: number,
): boolean {
  return isDebtOverdueByDueDate(paymentDueDate, debtAmount);
}

function overdueDaysByDueDate(paymentDueDate: Date | null | undefined): number {
  if (!paymentDueDate) return 0;
  const startOfToday = DateTime.fromISO(todayYmdKyiv(), { zone: CRM_TIME_ZONE }).startOf("day");
  const due = DateTime.fromJSDate(paymentDueDate).setZone(CRM_TIME_ZONE).startOf("day");
  return Math.max(0, Math.round(startOfToday.diff(due, "days").days));
}

function startOfKyivDayOffset(offsetDays: number): Date {
  return DateTime.fromISO(todayYmdKyiv(), { zone: CRM_TIME_ZONE })
    .startOf("day")
    .plus({ days: offsetDays })
    .toJSDate();
}

/** Orders whose own days-past-due fall into the aging bucket. */
function agingOrderWhere(label: ReceivablesAgingBucketLabel): Prisma.OrderWhereInput {
  const range = RECEIVABLES_AGING_BUCKET_RANGES[label];
  const paymentDueDate: Prisma.DateTimeNullableFilter = {
    lt: startOfKyivDayOffset(-Math.max(range.min, 1) + 1),
  };
  if (range.max != null) paymentDueDate.gte = startOfKyivDayOffset(-range.max);
  return { debtAmount: { gt: 0 }, paymentDueDate };
}

function parseAgingParam(raw?: string): ReceivablesAgingBucketLabel | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!isAgingBucketLabel(value)) {
    throw new BadRequestException(
      `aging must be one of: ${RECEIVABLES_AGING_BUCKET_LABELS.join(", ")}`,
    );
  }
  return value;
}

function toCodeForContact(code: string): string {
  return /^\d+$/.test(code) && code.length < 9 ? code.padStart(9, "0") : code;
}

@Injectable()
export class ReceivablesService {
  private readonly contactDebtCache = new Map<string, { at: number; value: Promise<ContactDebtMap> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly conversations: ConversationsService,
    private readonly paymentRequests: PaymentRequestsService,
  ) {}

  async listSnapshots(limit = 20) {
    const rows = await this.prisma.receivablesSnapshot.findMany({
      take: Math.min(Math.max(limit, 1), 100),
      orderBy: [{ snapshotDate: "desc" }, { importedAt: "desc" }],
      include: {
        importedBy: { select: { id: true, fullName: true } },
      },
    });
    return { items: rows };
  }

  async getLatestSnapshotId(): Promise<string | null> {
    const row = await this.prisma.receivablesSnapshot.findFirst({
      orderBy: [{ snapshotDate: "desc" }, { importedAt: "desc" }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async uploadSnapshot(params: {
    actor: AuthUser;
    fileBuffer: Buffer;
    snapshotDate?: string;
    note?: string;
    currency?: string;
  }) {
    if (params.actor.role !== UserRole.ADMIN && params.actor.role !== UserRole.LEAD) {
      throw new ForbiddenException("Only ADMIN or LEAD can upload receivables snapshots");
    }

    const sourceCurrency = this.parse1CCurrency(params.currency);
    const rows = parseReceivablesExcel(params.fileBuffer);
    const byCode = aggregateReceivablesRows(rows);
    const snapshotDate = this.parseSnapshotDate(params.snapshotDate);

    const snapshot = await this.prisma.receivablesSnapshot.create({
      data: {
        snapshotDate,
        importedById: params.actor.id,
        note: params.note?.trim() || null,
      },
    });

    await this.reconcileSnapshot(snapshot.id, byCode, sourceCurrency);
    return this.getSnapshot(snapshot.id);
  }

  private parse1CCurrency(raw?: string): Receivables1CCurrency {
    const c = (raw?.trim().toUpperCase() || RECEIVABLES_1C_AMOUNT_CURRENCY) as Receivables1CCurrency;
    if (!RECEIVABLES_1C_ALLOWED_CURRENCIES.includes(c)) {
      throw new BadRequestException(`currency must be one of: ${RECEIVABLES_1C_ALLOWED_CURRENCIES.join(", ")}`);
    }
    return c;
  }

  async refreshReconciliation(snapshotId: string, actor: AuthUser) {
    this.assertReconcileAdmin(actor);
    await this.assertSnapshotAccess(snapshotId, actor);
    this.contactDebtCache.clear();
    await this.reconcileSnapshot(snapshotId);
    return this.getReconciliationSummary(snapshotId, actor);
  }

  private assertReconcileAdmin(actor: AuthUser) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.LEAD) {
      throw new ForbiddenException("Only ADMIN or LEAD can change reconciliation");
    }
  }

  async linkReconcileLineContact(
    actor: AuthUser,
    lineId: string,
    body: { contactId?: string; overwrite?: boolean },
  ) {
    this.assertReconcileAdmin(actor);
    const contactId = body.contactId?.trim();
    if (!contactId) throw new BadRequestException("contactId is required");

    const line = await this.prisma.receivablesSnapshotLine.findUnique({
      where: { id: lineId },
      select: { id: true, snapshotId: true, counterpartyCode1C: true, status: true, contactId: true },
    });
    if (!line) throw new NotFoundException("Reconciliation line not found");
    if (line.status !== "ONLY_1C" || line.contactId) {
      throw new BadRequestException("Only ONLY_1C lines without a contact can be linked");
    }
    const code = normalizeCounterpartyCode1C(line.counterpartyCode1C);
    if (!code) throw new BadRequestException("Line has no 1C code");

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, externalCode: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    const prevCode = normalizeCounterpartyCode1C(contact.externalCode ?? "");
    if (prevCode && prevCode !== code && !body.overwrite) {
      throw new BadRequestException(
        `Contact already has 1C code ${contact.externalCode}; pass overwrite=true to replace it`,
      );
    }

    const externalCode = prevCode === code ? contact.externalCode! : toCodeForContact(code);
    if (externalCode !== contact.externalCode) {
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { externalCode },
      });
    }

    this.contactDebtCache.clear();
    await this.reconcileSnapshot(line.snapshotId);

    const updated = await this.prisma.receivablesSnapshotLine.findFirst({
      where: { snapshotId: line.snapshotId, counterpartyCode1C: code },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            owner: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    return {
      ok: true,
      contactId: contact.id,
      externalCode,
      previousExternalCode: contact.externalCode ?? null,
      line: updated
        ? {
            id: updated.id,
            counterpartyCode1C: updated.counterpartyCode1C,
            amount1C: updated.amount1C,
            amountCRM: updated.amountCRM,
            delta: updated.delta,
            status: updated.status,
            contactId: updated.contactId,
            clientName: updated.contact
              ? [updated.contact.firstName, updated.contact.lastName].filter(Boolean).join(" ")
              : null,
            ownerName: updated.contact?.owner?.fullName ?? null,
          }
        : null,
    };
  }

  private parseSnapshotDate(raw?: string): Date {
    const ymd = raw?.trim() || todayYmdKyiv();
    const d = new Date(`${ymd}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException("Invalid snapshotDate");
    }
    return d;
  }

  private async reconcileSnapshot(
    snapshotId: string,
    amount1CRawByCode?: Map<string, number>,
    sourceCurrency: Receivables1CCurrency = RECEIVABLES_1C_AMOUNT_CURRENCY,
  ) {
    const snapshot = await this.prisma.receivablesSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot) throw new NotFoundException("Snapshot not found");

    const rates = await this.settings.getExchangeRates();
    const tolerance = RECEIVABLES_DELTA_TOLERANCE;

    const amount1CByCode = new Map<string, number>();
    if (amount1CRawByCode) {
      for (const [code, raw] of amount1CRawByCode) {
        amount1CByCode.set(code, this.amount1CToBase(raw, rates, sourceCurrency));
      }
    } else {
      const existing = await this.prisma.receivablesSnapshotLine.findMany({
        where: { snapshotId, amount1C: { gt: 0 } },
      });
      for (const line of existing) {
        const code = normalizeCounterpartyCode1C(line.counterpartyCode1C);
        amount1CByCode.set(code, (amount1CByCode.get(code) ?? 0) + line.amount1C);
      }
    }

    if (amount1CByCode.size === 0) {
      throw new BadRequestException("Snapshot has no 1C rows to reconcile");
    }

    const codes = [...amount1CByCode.keys()];
    const codeSet = new Set(codes);
    const contacts = await this.prisma.$queryRaw<Array<{ id: string; externalCode: string | null }>>(
      Prisma.sql`
        SELECT id, "externalCode"
        FROM "Contact"
        WHERE "externalCode" IS NOT NULL
          AND COALESCE(NULLIF(ltrim(btrim("externalCode"), '0'), ''), '0') = ANY(${codes}::text[])
        ORDER BY "createdAt" ASC
      `,
    );

    const contactsByCode = new Map<string, (typeof contacts)[number][]>();
    for (const c of contacts) {
      const code = normalizeCounterpartyCode1C(c.externalCode ?? "");
      if (!code || !codeSet.has(code)) continue;
      const list = contactsByCode.get(code) ?? [];
      list.push(c);
      contactsByCode.set(code, list);
    }

    const contactDebt = await this.loadContactDebtMap(null, rates);

    const reconcileLines: Array<{
      counterpartyCode1C: string;
      amount1C: number;
      amountCRM: number;
      delta: number;
      contactId: string | null;
      status: ReceivablesReconcileStatus;
    }> = [];

    let total1C = 0;
    let totalCRM = 0;
    let deltaCount = 0;
    let alignedCount = 0;

    for (const [code, rawAmount1C] of amount1CByCode) {
      const amount1C = rawAmount1C;
      total1C += amount1C;

      const matched = contactsByCode.get(code) ?? [];
      const primary = matched[0] ?? null;
      let amountCRM = 0;
      for (const c of matched) {
        amountCRM += contactDebt.get(c.id)?.debtBase ?? 0;
      }
      totalCRM += amountCRM;

      const delta = Math.round((amount1C - amountCRM) * 100) / 100;
      const status = computeReconcileStatus(
        amount1C,
        amountCRM,
        primary?.id ?? null,
        true,
        tolerance,
      );
      if (isReceivablesDeltaStatus(status)) deltaCount += 1;
      else alignedCount += 1;

      reconcileLines.push({
        counterpartyCode1C: code,
        amount1C,
        amountCRM,
        delta,
        contactId: primary?.id ?? null,
        status,
      });
    }

    const codesIn1C = new Set(amount1CByCode.keys());
    for (const [contactId, row] of contactDebt) {
      if (row.externalCode && codesIn1C.has(row.externalCode)) continue;
      const amountCRM = row.debtBase;
      if (amountCRM <= tolerance) continue;
      totalCRM += amountCRM;
      const status: ReceivablesReconcileStatus = "ONLY_CRM";
      deltaCount += 1;
      reconcileLines.push({
        counterpartyCode1C: row.externalCode ?? "",
        amount1C: 0,
        amountCRM,
        delta: -amountCRM,
        contactId,
        status,
      });
    }

    await this.prisma.$transaction([
      this.prisma.receivablesSnapshotLine.deleteMany({ where: { snapshotId } }),
      this.prisma.receivablesSnapshotLine.createMany({
        data: reconcileLines.map((line) => ({
          snapshotId,
          ...line,
        })),
      }),
      this.prisma.receivablesSnapshot.update({
        where: { id: snapshotId },
        data: {
          total1C: Math.round(total1C * 100) / 100,
          totalCRM: Math.round(totalCRM * 100) / 100,
          deltaCount,
          alignedCount,
        },
      }),
    ]);
  }

  private amount1CToBase(
    amount: number,
    rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
    sourceCurrency: Receivables1CCurrency = RECEIVABLES_1C_AMOUNT_CURRENCY,
  ) {
    return Math.round(toBaseCurrency(amount, sourceCurrency, rates) * 100) / 100;
  }

  /** Deduplicates the summary/clients/aging calls of a single page load. */
  private loadContactDebtMap(
    scope: Awaited<ReturnType<AnalyticsScopeService["resolveDashboardScope"]>> | null,
    rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
  ): Promise<ContactDebtMap> {
    const key = JSON.stringify({
      all: scope == null,
      managerId: scope?.orderScope.managerId ?? null,
      allowedOwnerIds: scope?.orderScope.allowedOwnerIds ?? null,
      today: todayYmdKyiv(),
      base: getBaseCurrency(rates),
      uah: rates.UAH_TO_USD,
      eur: rates.EUR_TO_USD,
    });
    const now = Date.now();
    for (const [k, v] of this.contactDebtCache) {
      if (now - v.at > CONTACT_DEBT_CACHE_TTL_MS) this.contactDebtCache.delete(k);
    }
    const cached = this.contactDebtCache.get(key);
    if (cached) return cached.value;
    const value = this.computeContactDebtMap(scope, rates);
    this.contactDebtCache.set(key, { at: now, value });
    value.catch(() => this.contactDebtCache.delete(key));
    return value;
  }

  private async loadLastPaymentByClient(clientIds: string[]): Promise<Map<string, Date>> {
    const map = new Map<string, Date>();
    if (clientIds.length === 0) return map;
    const rows = await this.prisma.$queryRaw<Array<{ clientId: string; lastPaidAt: Date | null }>>(
      Prisma.sql`
        SELECT o."clientId" AS "clientId", MAX(p."paidAt") AS "lastPaidAt"
        FROM "Payment" p
        JOIN "Order" o ON o.id = p."orderId"
        WHERE p.status = 'COMPLETED' AND o."clientId" = ANY(${clientIds}::text[])
        GROUP BY o."clientId"
      `,
    );
    for (const row of rows) {
      if (row.clientId && row.lastPaidAt) map.set(row.clientId, new Date(row.lastPaidAt));
    }
    return map;
  }

  private async computeContactDebtMap(
    scope: Awaited<ReturnType<AnalyticsScopeService["resolveDashboardScope"]>> | null,
    rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
  ): Promise<ContactDebtMap> {
    const orderWhere: Prisma.OrderWhereInput = scope
      ? buildReceivablesDebtOrderWhere(scope)
      : buildOperationalDebtOrderWhere({
          OR: [{ debtAmount: { gt: 0 } }, { creditAmount: { gt: 0 } }],
          clientId: { not: null },
        });

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        clientId: true,
        debtAmount: true,
        creditAmount: true,
        currency: true,
        paymentDueDate: true,
        client: {
          select: {
            id: true,
            externalCode: true,
            ownerId: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    const clientIds = [...new Set(orders.map((o) => o.clientId).filter(Boolean))] as string[];
    const lastPaymentByClient = await this.loadLastPaymentByClient(clientIds);

    const map: ContactDebtMap = new Map();
    for (const o of orders) {
      const client = o.client;
      if (!client) continue;
      const debtRaw = orderStoredAmount(o.debtAmount);
      const creditRaw = orderStoredAmount(o.creditAmount);
      const debtBase = debtRaw > 0 ? toBaseCurrency(debtRaw, o.currency, rates) : 0;
      const creditBase = creditRaw > 0 ? toBaseCurrency(creditRaw, o.currency, rates) : 0;
      const overdueBase = isOrderOverdueByDueDate(o.paymentDueDate, debtBase) ? debtBase : 0;
      const days = overdueBase > 0 ? overdueDaysByDueDate(o.paymentDueDate) : 0;
      const code = normalizeCounterpartyCode1C(client.externalCode ?? "");
      const overdueOrder = overdueBase > 0 && days > 0 ? { days, amount: overdueBase } : null;
      const prev = map.get(client.id);
      if (prev) {
        prev.debtBase += debtBase;
        prev.overdueBase += overdueBase;
        prev.creditBase += creditBase;
        prev.orderCount += 1;
        prev.overdueDays = Math.max(prev.overdueDays, days);
        if (overdueOrder) prev.overdueOrders.push(overdueOrder);
        const betterPrimary =
          (overdueBase > 0 && !prev.primaryOverdue) ||
          (overdueBase > 0 === prev.primaryOverdue && debtBase > prev.primaryDebt);
        if (betterPrimary) {
          prev.primaryOrderId = o.id;
          prev.primaryOverdue = overdueBase > 0;
          prev.primaryDebt = debtBase;
        }
      } else {
        map.set(client.id, {
          contactId: client.id,
          externalCode: code,
          debtBase,
          overdueBase,
          creditBase,
          orderCount: 1,
          ownerId: client.ownerId,
          firstName: client.firstName,
          lastName: client.lastName,
          phone: client.phone ?? null,
          lastPaymentAt: lastPaymentByClient.get(client.id) ?? null,
          overdueDays: days,
          primaryOrderId: o.id,
          primaryOverdue: overdueBase > 0,
          primaryDebt: debtBase,
          overdueOrders: overdueOrder ? [overdueOrder] : [],
        });
      }
    }
    return map;
  }

  async getSnapshot(id: string) {
    const row = await this.prisma.receivablesSnapshot.findUnique({
      where: { id },
      include: { importedBy: { select: { id: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException("Snapshot not found");
    return row;
  }

  private async assertSnapshotAccess(snapshotId: string, actor: AuthUser) {
    const exists = await this.prisma.receivablesSnapshot.findUnique({
      where: { id: snapshotId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Snapshot not found");
    if (actor.role === UserRole.MANAGER) {
      return;
    }
  }

  private async buildLineFilter(actor: AuthUser, ownerId?: string) {
    const scope = await this.scopeService.resolveDashboardScope(actor, { managerId: ownerId });
    if (actor.role === UserRole.ADMIN && !ownerId) {
      return {};
    }
    if (scope.emptyTeam) {
      return { contactId: { in: [] as string[] } };
    }
    if (scope.orderScope.managerId) {
      return {
        OR: [
          { contact: { ownerId: scope.orderScope.managerId } },
          ...(actor.role === UserRole.MANAGER
            ? []
            : [{ status: "ONLY_1C" as const, contactId: null }]),
        ],
      };
    }
    if (scope.orderScope.allowedOwnerIds !== undefined) {
      return {
        OR: [
          { contact: { ownerId: { in: scope.orderScope.allowedOwnerIds } } },
          ...(actor.role === UserRole.MANAGER
            ? []
            : [{ status: "ONLY_1C" as const, contactId: null }]),
        ],
      };
    }
    if (actor.role === UserRole.MANAGER) {
      return {
        contact: { ownerId: actor.id },
      };
    }
    return {};
  }

  async getReconciliationSummary(snapshotId: string, actor: AuthUser, ownerId?: string) {
    await this.assertSnapshotAccess(snapshotId, actor);
    const snapshot = await this.getSnapshot(snapshotId);
    const lineFilter = await this.buildLineFilter(actor, ownerId);

    const lines = await this.prisma.receivablesSnapshotLine.findMany({
      where: { snapshotId, ...lineFilter },
    });

    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);

    let total1C = 0;
    let totalCRM = 0;
    let deltaCount = 0;
    let alignedCount = 0;
    let noCodeCount = 0;

    for (const line of lines) {
      if (actor.role === UserRole.MANAGER && line.status === "ONLY_1C") continue;
      total1C += line.amount1C;
      totalCRM += line.amountCRM;
      if (line.status === "ONLY_CRM" && !line.counterpartyCode1C) noCodeCount += 1;
      if (isReceivablesDeltaStatus(line.status)) {
        deltaCount += 1;
      } else {
        alignedCount += 1;
      }
    }

    return {
      snapshot,
      currency,
      kpi: {
        total1C: Math.round(total1C * 100) / 100,
        totalCRM: Math.round(totalCRM * 100) / 100,
        totalDelta: Math.round((total1C - totalCRM) * 100) / 100,
        deltaCount,
        alignedCount,
        /** Same as deltaCount (already scoped to the actor); kept for API compatibility. */
        managerDeltaCount: deltaCount,
        noCodeCount,
        isAligned: deltaCount === 0,
      },
    };
  }

  async listReconciliation(
    snapshotId: string,
    actor: AuthUser,
    query: {
      page?: number;
      pageSize?: number;
      status?: string;
      deltasOnly?: boolean;
      q?: string;
      ownerId?: string;
    },
  ) {
    await this.assertSnapshotAccess(snapshotId, actor);
    const pagination = normalizePagination(query, { page: 1, pageSize: 50 });
    const lineFilter = await this.buildLineFilter(actor, query.ownerId);

    const and: Prisma.ReceivablesSnapshotLineWhereInput[] = [{ snapshotId }, lineFilter];

    if (query.status === "NO_CODE") {
      and.push({ status: "ONLY_CRM", counterpartyCode1C: "" });
    } else if (query.deltasOnly) {
      and.push({ status: { not: "ALIGNED" } });
    } else if (query.status) {
      if (!(Object.values(ReceivablesReconcileStatus) as string[]).includes(query.status)) {
        throw new BadRequestException("Invalid status");
      }
      and.push({ status: query.status as ReceivablesReconcileStatus });
    }

    if (actor.role === UserRole.MANAGER) {
      and.push({ status: { not: "ONLY_1C" } });
    }

    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { counterpartyCode1C: { contains: q, mode: "insensitive" } },
          { contact: { firstName: { contains: q, mode: "insensitive" } } },
          { contact: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    const where: Prisma.ReceivablesSnapshotLineWhereInput = { AND: and };

    const [total, rows] = await Promise.all([
      this.prisma.receivablesSnapshotLine.count({ where }),
      this.prisma.receivablesSnapshotLine.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: [{ status: "asc" }, { delta: "desc" }],
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              externalCode: true,
              owner: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
    ]);

    const rates = await this.settings.getExchangeRates();
    return {
      currency: getBaseCurrency(rates),
      items: rows.map((row) => ({
        id: row.id,
        counterpartyCode1C: row.counterpartyCode1C,
        amount1C: row.amount1C,
        amountCRM: row.amountCRM,
        delta: row.delta,
        status: row.status,
        contactId: row.contactId,
        clientName: row.contact
          ? [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ")
          : null,
        ownerName: row.contact?.owner?.fullName ?? null,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async getWorkSummary(actor: AuthUser, ownerId?: string) {
    const scope = await this.scopeService.resolveDashboardScope(actor, { managerId: ownerId });
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);

    if (scope.emptyTeam) {
      return {
        currency,
        reconciliation: null,
        kpi: {
          debtTotal: 0,
          overdueDebt: 0,
          clientsWithDebtCount: 0,
          ordersWithDebtCount: 0,
          bitrixLegacyDebt: 0,
          bitrixLegacyOrdersCount: 0,
          promisedTodayAmount: 0,
          promisedTodayCount: 0,
          collectedTodayAmount: 0,
        },
      };
    }

    const bitrixDebtWhere = buildBitrixLegacyDebtOrderWhere(scope);
    const contactDebt = await this.loadContactDebtMap(scope, rates);

    let debtTotal = 0;
    let overdueDebt = 0;
    let clientsWithDebtCount = 0;
    for (const row of contactDebt.values()) {
      debtTotal += row.debtBase;
      overdueDebt += row.overdueBase;
      if (row.debtBase > 0.009) clientsWithDebtCount += 1;
    }

    const [ordersWithDebtCount, bitrixLegacyOrdersCount, bitrixLegacyDebt] = await Promise.all([
      this.prisma.order.count({ where: buildReceivablesPositiveDebtOrderWhere(scope) }),
      this.prisma.order.count({ where: bitrixDebtWhere }),
      this.sumOrderDebtBase(bitrixDebtWhere, rates),
    ]);
    const latestSnapshotId = await this.getLatestSnapshotId();
    let reconciliation: {
      snapshotId: string;
      snapshotDate: string;
      isAligned: boolean;
      managerDeltaCount: number;
      deltaCount: number;
      total1C: number;
      totalCRM: number;
      totalDelta: number;
    } | null = null;

    if (latestSnapshotId) {
      const summary = await this.getReconciliationSummary(latestSnapshotId, actor, ownerId);
      reconciliation = {
        snapshotId: latestSnapshotId,
        snapshotDate: summary.snapshot.snapshotDate.toISOString(),
        isAligned: summary.kpi.isAligned,
        managerDeltaCount: summary.kpi.managerDeltaCount,
        deltaCount: summary.kpi.deltaCount,
        total1C: summary.kpi.total1C,
        totalCRM: summary.kpi.totalCRM,
        totalDelta: summary.kpi.totalDelta,
      };
    }

    const lastComments = await this.loadLastDebtComments([...contactDebt.keys()]);
    const todayYmd = todayYmdKyiv();
    let promisedTodayAmount = 0;
    let promisedTodayCount = 0;
    for (const row of contactDebt.values()) {
      const last = lastComments.get(row.contactId);
      const parsed = parseDebtCommentTitle(last?.title ?? null);
      if (isPromiseForYmd(parsed.promiseDate, todayYmd)) {
        promisedTodayCount += 1;
        promisedTodayAmount += parsed.promiseAmount ?? row.debtBase;
      }
    }

    const todayStart = DateTime.fromISO(todayYmd, { zone: CRM_TIME_ZONE }).startOf("day").toJSDate();
    const todayEnd = DateTime.fromISO(todayYmd, { zone: CRM_TIME_ZONE }).endOf("day").toJSDate();
    const todayPayWhere: Prisma.PaymentWhereInput = {
      status: "COMPLETED",
      paidAt: { gte: todayStart, lte: todayEnd },
      order: scope.orderScope.managerId
        ? { ownerId: scope.orderScope.managerId }
        : scope.orderScope.allowedOwnerIds !== undefined
          ? { ownerId: { in: scope.orderScope.allowedOwnerIds } }
          : {},
    };
    const todayPays = await this.prisma.payment.findMany({
      where: todayPayWhere,
      select: { amountUsd: true, amount: true, currency: true },
    });
    let collectedTodayAmount = 0;
    for (const p of todayPays) {
      collectedTodayAmount += paymentToBase(p.amountUsd, p.amount, p.currency, rates);
    }

    return {
      currency,
      reconciliation,
      kpi: {
        debtTotal: Math.round(debtTotal * 100) / 100,
        overdueDebt: Math.round(overdueDebt * 100) / 100,
        clientsWithDebtCount,
        ordersWithDebtCount,
        bitrixLegacyDebt: Math.round(bitrixLegacyDebt * 100) / 100,
        bitrixLegacyOrdersCount,
        promisedTodayAmount: Math.round(promisedTodayAmount * 100) / 100,
        promisedTodayCount,
        collectedTodayAmount: Math.round(collectedTodayAmount * 100) / 100,
      },
    };
  }

  private async sumOrderDebtBase(
    where: Prisma.OrderWhereInput,
    rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
  ): Promise<number> {
    const rows = await this.prisma.order.findMany({
      where,
      select: { debtAmount: true, currency: true },
    });
    let total = 0;
    for (const row of rows) {
      total += toBaseCurrency(orderStoredAmount(row.debtAmount), row.currency, rates);
    }
    return total;
  }

  async listWorkClients(
    actor: AuthUser,
    query: {
      page?: number;
      pageSize?: number;
      q?: string;
      ownerId?: string;
      overdue?: boolean;
      needsComment?: boolean;
      promisedToday?: boolean;
      promiseBroken?: boolean;
      reconcileDeltaOnly?: boolean;
      delayReason?: string;
      aging?: string;
      snoozed?: string;
      sort?: string;
      dir?: string;
    },
  ) {
    const aging = parseAgingParam(query.aging);
    const scope = await this.scopeService.resolveDashboardScope(actor, { managerId: query.ownerId });
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);

    if (scope.emptyTeam) {
      return { currency, items: [], total: 0, page: 1, pageSize: 50, snoozedCount: 0 };
    }

    const sort = parseWorkClientsSort(query.sort, query.dir);

    const contactDebt = await this.loadContactDebtMap(scope, rates);
    let items = [...contactDebt.values()].map((row) => ({
      contactId: row.contactId,
      clientName: [row.firstName, row.lastName].filter(Boolean).join(" "),
      externalCode: row.externalCode || null,
      debtAmount: Math.round(row.debtBase * 100) / 100,
      overdueAmount: Math.round(row.overdueBase * 100) / 100,
      overpaymentAmount: Math.round(row.creditBase * 100) / 100,
      orderCount: row.orderCount,
      ownerId: row.ownerId,
      lastPaymentAt: row.lastPaymentAt?.toISOString() ?? null,
      phone: row.phone,
      overdueDays: row.overdueDays,
      agingBucket: row.overdueDays > 0 ? agingBucketLabel(row.overdueDays) : null,
      primaryOrderId: row.primaryOrderId,
    }));

    if (query.overdue) {
      items = items.filter((i) => i.overdueAmount > 0);
    }

    if (aging) {
      items = items.filter((i) => i.agingBucket === aging);
    }

    const q = query.q?.trim();
    if (q) {
      items = items.filter((i) => matchesWorkClientQuery(i, q));
    }

    const todayYmd = todayYmdKyiv();
    const [lastCommentByContact, reconcileByContact, snoozeByContact] = await Promise.all([
      this.loadLastDebtComments(items.map((i) => i.contactId)),
      this.loadLatestReconcileStatusMap(
        items.map((i) => i.contactId),
        actor,
      ),
      this.loadActiveSnoozes(
        items.map((i) => i.contactId),
        todayYmd,
      ),
    ]);

    if (query.needsComment) {
      const staleBefore = new Date(
        Date.now() - RECEIVABLES_COMMENT_STALE_DAYS * 24 * 60 * 60 * 1000,
      );
      items = items.filter((i) => {
        const last = lastCommentByContact.get(i.contactId);
        return !last || last.createdAt < staleBefore;
      });
    }

    const promiseBrokenFor = (i: { contactId: string; lastPaymentAt: string | null }) => {
      const last = lastCommentByContact.get(i.contactId);
      const parsed = parseDebtCommentTitle(last?.title ?? null);
      return isPromiseBroken(parsed.promiseDate, todayYmd, {
        promisedAt: last?.createdAt ?? null,
        lastPaymentAt: i.lastPaymentAt ? new Date(i.lastPaymentAt) : null,
      });
    };

    if (query.promisedToday) {
      items = items.filter((i) => {
        const parsed = parseDebtCommentTitle(lastCommentByContact.get(i.contactId)?.title ?? null);
        return isPromiseForYmd(parsed.promiseDate, todayYmd);
      });
    }
    if (query.promiseBroken) {
      items = items.filter(promiseBrokenFor);
    }

    if (query.reconcileDeltaOnly) {
      items = items.filter((i) => {
        const status = reconcileByContact.get(i.contactId);
        return status != null && isReceivablesDeltaStatus(status);
      });
    }

    if (query.delayReason && isDelayReasonCode(query.delayReason)) {
      items = items.filter((i) => {
        const parsed = parseDebtCommentTitle(lastCommentByContact.get(i.contactId)?.title ?? null);
        return parsed.delayReasonCode === query.delayReason;
      });
    }

    if (query.snoozed === "only") {
      items = items.filter((i) => snoozeByContact.has(i.contactId));
    } else if (query.snoozed === "hide") {
      items = items.filter((i) => !snoozeByContact.has(i.contactId));
    }

    const lastCommentIso = (contactId: string) =>
      lastCommentByContact.get(contactId)?.createdAt.toISOString() ?? null;
    items.sort((a, b) =>
      compareWorkClients(
        { ...a, lastCommentAt: lastCommentIso(a.contactId) },
        { ...b, lastCommentAt: lastCommentIso(b.contactId) },
        sort,
      ),
    );

    const pagination = normalizePagination(query, { page: 1, pageSize: 50 });
    const total = items.length;
    const pageItems = items.slice(pagination.offset, pagination.offset + pagination.limit);

    const ownerIds = [...new Set(pageItems.map((i) => i.ownerId).filter(Boolean))] as string[];
    const authorIds = [
      ...new Set(
        pageItems
          .map((i) => lastCommentByContact.get(i.contactId)?.createdBy)
          .filter(Boolean) as string[],
      ),
    ];
    const snoozerIds = pageItems
      .map((i) => snoozeByContact.get(i.contactId)?.byId)
      .filter(Boolean) as string[];
    const userIds = [...new Set([...ownerIds, ...authorIds, ...snoozerIds])];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          })
        : [];
    const userMap = new Map(users.map((o) => [o.id, o.fullName]));

    const telegramByContact = await this.loadTelegramConversationIds(
      pageItems.map((i) => i.contactId),
    );

    return {
      currency,
      items: pageItems.map((i) => {
        const last = lastCommentByContact.get(i.contactId) ?? null;
        const parsed = parseDebtCommentTitle(last?.title ?? null);
        const snooze = snoozeByContact.get(i.contactId) ?? null;
        return {
          ...i,
          ownerName: i.ownerId ? (userMap.get(i.ownerId) ?? null) : null,
          lastCommentAt: last?.createdAt.toISOString() ?? null,
          lastCommentPreview: last ? truncatePreview(last.body) : null,
          lastCommentAuthorName: last ? (userMap.get(last.createdBy) ?? null) : null,
          promiseDate: parsed.promiseDate,
          promiseAmount: parsed.promiseAmount,
          promiseBroken: promiseBrokenFor(i),
          delayReasonCode: parsed.delayReasonCode,
          reconcileStatus: reconcileByContact.get(i.contactId) ?? null,
          telegramConversationId: telegramByContact.get(i.contactId) ?? null,
          snoozedUntil: snooze?.until ?? null,
          snoozedByName: snooze?.byId ? (userMap.get(snooze.byId) ?? null) : null,
        };
      }),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      snoozedCount: snoozeByContact.size,
    };
  }

  private async loadActiveSnoozes(
    contactIds: string[],
    todayYmd: string,
  ): Promise<Map<string, { until: string; byId: string | null }>> {
    const map = new Map<string, { until: string; byId: string | null }>();
    const uniqueIds = [...new Set(contactIds.filter(Boolean))];
    if (uniqueIds.length === 0) return map;
    const rows = await this.prisma.contact.findMany({
      where: {
        id: { in: uniqueIds },
        receivablesSnoozedUntil: { gt: snoozeYmdToDbDate(todayYmd) },
      },
      select: { id: true, receivablesSnoozedUntil: true, receivablesSnoozedById: true },
    });
    for (const row of rows) {
      const until = activeSnoozeYmd(row.receivablesSnoozedUntil, todayYmd);
      if (until) map.set(row.id, { until, byId: row.receivablesSnoozedById });
    }
    return map;
  }

  private async loadLatestReconcileStatusMap(
    contactIds: string[],
    actor: AuthUser,
  ): Promise<Map<string, ReceivablesReconcileStatus>> {
    const map = new Map<string, ReceivablesReconcileStatus>();
    const uniqueIds = [...new Set(contactIds.filter(Boolean))];
    if (uniqueIds.length === 0) return map;

    const snapshotId = await this.getLatestSnapshotId();
    if (!snapshotId) return map;

    const lines = await this.prisma.receivablesSnapshotLine.findMany({
      where: {
        snapshotId,
        contactId: { in: uniqueIds },
        ...(actor.role === UserRole.MANAGER ? { status: { not: "ONLY_1C" } } : {}),
      },
      select: { contactId: true, status: true },
    });
    for (const line of lines) {
      if (line.contactId) map.set(line.contactId, line.status);
    }
    return map;
  }

  private async loadTelegramConversationIds(contactIds: string[]) {
    const map = new Map<string, string>();
    const uniqueIds = [...new Set(contactIds.filter(Boolean))];
    if (uniqueIds.length === 0) return map;
    const rows = await this.prisma.conversation.findMany({
      where: {
        contactId: { in: uniqueIds },
        channel: ConversationChannel.TELEGRAM,
        telegramChatId: { not: null },
      },
      select: { id: true, contactId: true },
      orderBy: { lastMessageAt: "desc" },
    });
    for (const row of rows) {
      if (row.contactId && !map.has(row.contactId)) map.set(row.contactId, row.id);
    }
    return map;
  }

  async getWorkAging(actor: AuthUser, ownerId?: string) {
    const scope = await this.scopeService.resolveDashboardScope(actor, { managerId: ownerId });
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);

    if (scope.emptyTeam) {
      return { currency, buckets: buildAgingBuckets([]) };
    }

    const contactDebt = await this.loadContactDebtMap(scope, rates);
    return { currency, buckets: buildAgingBuckets(contactDebt.values()) };
  }

  async batchActions(
    actor: AuthUser,
    body: {
      contactIds?: string[];
      action?: "assign_owner" | "create_call_tasks" | "send_telegram" | "snooze";
      ownerId?: string;
      message?: string;
      days?: number;
      until?: string;
    },
  ) {
    const contactIds = [...new Set((body.contactIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (contactIds.length === 0) throw new BadRequestException("contactIds is required");
    if (contactIds.length > 100) throw new BadRequestException("Too many contacts (max 100)");
    const action = body.action;
    if (!action) throw new BadRequestException("action is required");

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, ownerId: true, firstName: true, lastName: true },
    });
    if (contacts.length === 0) throw new NotFoundException("Contacts not found");
    for (const c of contacts) this.assertContactAccess(c, actor);

    if (action === "assign_owner") {
      if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.LEAD) {
        throw new ForbiddenException("Only ADMIN or LEAD can reassign managers");
      }
      const ownerId = body.ownerId?.trim();
      if (!ownerId) throw new BadRequestException("ownerId is required");
      const owner = await this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, role: true },
      });
      if (!owner || (owner.role !== UserRole.MANAGER && owner.role !== UserRole.LEAD)) {
        throw new BadRequestException("Invalid ownerId");
      }
      const ids = contacts.map((c) => c.id);
      const [, ordersResult] = await this.prisma.$transaction([
        this.prisma.contact.updateMany({
          where: { id: { in: ids } },
          data: { ownerId },
        }),
        this.prisma.order.updateMany({
          where: buildOperationalDebtOrderWhere({
            OR: [{ debtAmount: { gt: 0 } }, { creditAmount: { gt: 0 } }],
            clientId: { in: ids },
          }),
          data: { ownerId },
        }),
      ]);
      this.contactDebtCache.clear();
      return {
        ok: true,
        action,
        processed: contacts.length,
        skipped: 0,
        ordersReassigned: ordersResult.count,
      };
    }

    if (action === "create_call_tasks") {
      const today = DateTime.now().setZone(CRM_TIME_ZONE);
      const dueAt = today.endOf("day").toJSDate();
      const existing = await this.prisma.task.findMany({
        where: {
          contactId: { in: contacts.map((c) => c.id) },
          status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
          title: { startsWith: CALL_TASK_TITLE_PREFIX },
          dueAt: { gte: today.startOf("day").toJSDate(), lte: dueAt },
        },
        select: { contactId: true },
      });
      const hasTask = new Set(existing.map((t) => t.contactId));
      const toCreate = contacts.filter((c) => !hasTask.has(c.id));
      if (toCreate.length > 0) {
        await this.prisma.task.createMany({
          data: toCreate.map((c) => ({
            assigneeId: c.ownerId ?? actor.id,
            createdById: actor.id,
            contactId: c.id,
            title: `${CALL_TASK_TITLE_PREFIX} — ${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.id}`,
            body: "Задача створена з розділу Дебіторка (масова дія).",
            dueAt,
          })),
        });
      }
      return {
        ok: true,
        action,
        processed: toCreate.length,
        skipped: contacts.length - toCreate.length,
      };
    }

    if (action === "snooze") {
      const until = this.resolveSnoozeUntil(body);
      await this.applySnooze(actor, contacts.map((c) => c.id), until);
      return { ok: true, action, processed: contacts.length, skipped: 0, snoozedUntil: until };
    }

    if (action === "send_telegram") {
      const message = body.message?.trim() ?? "";
      if (!message) throw new BadRequestException("message is required");
      const telegramMap = await this.loadTelegramConversationIds(contacts.map((c) => c.id));
      let processed = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const c of contacts) {
        const conversationId = telegramMap.get(c.id);
        if (!conversationId) {
          skipped += 1;
          continue;
        }
        try {
          await this.conversations.sendMessage(conversationId, message, actor);
          processed += 1;
        } catch (e) {
          skipped += 1;
          errors.push(`${c.id}: ${e instanceof Error ? e.message : "send failed"}`);
        }
      }
      return { ok: true, action, processed, skipped, errors: errors.slice(0, 10) };
    }

    throw new BadRequestException("Unknown action");
  }

  private resolveSnoozeUntil(input: { days?: unknown; until?: unknown }): string {
    const result = computeSnoozeUntilYmd(input, todayYmdKyiv());
    if (!result.ok) throw new BadRequestException(result.error);
    return result.until;
  }

  private async applySnooze(actor: AuthUser, contactIds: string[], untilYmd: string) {
    const title = formatSnoozeActivityTitle(untilYmd);
    await this.prisma.$transaction([
      this.prisma.contact.updateMany({
        where: { id: { in: contactIds } },
        data: {
          receivablesSnoozedUntil: snoozeYmdToDbDate(untilYmd),
          receivablesSnoozedById: actor.id,
        },
      }),
      this.prisma.activity.createMany({
        data: contactIds.map((contactId) => ({
          type: ActivityType.COMMENT,
          title,
          body: `Клієнта відкладено в черзі «Сьогодні зібрати» до ${untilYmd}.`,
          createdBy: actor.id,
          contactId,
        })),
      }),
    ]);
  }

  async snoozeContact(
    actor: AuthUser,
    contactId: string,
    body: { days?: unknown; until?: unknown },
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(contact, actor);
    const until = this.resolveSnoozeUntil(body ?? {});
    await this.applySnooze(actor, [contact.id], until);
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { fullName: true },
    });
    return {
      ok: true,
      contactId: contact.id,
      snoozedUntil: until,
      snoozedByName: user?.fullName ?? null,
    };
  }

  async unsnoozeContact(actor: AuthUser, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true, receivablesSnoozedUntil: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(contact, actor);
    const wasActive = activeSnoozeYmd(contact.receivablesSnoozedUntil, todayYmdKyiv()) != null;
    await this.prisma.$transaction([
      this.prisma.contact.update({
        where: { id: contact.id },
        data: { receivablesSnoozedUntil: null, receivablesSnoozedById: null },
      }),
      ...(wasActive
        ? [
            this.prisma.activity.create({
              data: {
                type: ActivityType.COMMENT,
                title: "Повернуто в чергу (дебіторка)",
                body: "Відкладення клієнта в черзі «Сьогодні зібрати» скасовано.",
                createdBy: actor.id,
                contactId: contact.id,
              },
            }),
          ]
        : []),
    ]);
    return { ok: true, contactId: contact.id, snoozedUntil: null, snoozedByName: null };
  }

  private async loadLastDebtComments(contactIds: string[]) {
    const uniqueIds = [...new Set(contactIds.filter(Boolean))];
    const map = new Map<
      string,
      { body: string; createdAt: Date; createdBy: string; title: string | null }
    >();
    if (uniqueIds.length === 0) return map;

    const rows = await this.prisma.$queryRaw<
      Array<{ contactId: string; body: string; createdAt: Date; createdBy: string; title: string | null }>
    >(
      Prisma.sql`
        SELECT DISTINCT ON ("contactId") "contactId", body, "createdAt", "createdBy", title
        FROM "Activity"
        WHERE "contactId" = ANY(${uniqueIds}::text[])
          AND type = 'COMMENT'
          AND title LIKE ${`${RECEIVABLES_COMMENT_TITLE}%`}
        ORDER BY "contactId", "createdAt" DESC
      `,
    );

    for (const row of rows) {
      if (!row.contactId || map.has(row.contactId)) continue;
      map.set(row.contactId, {
        body: row.body,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        title: row.title,
      });
    }
    return map;
  }

  async addDebtComment(
    actor: AuthUser,
    contactId: string,
    bodyRaw: string,
    promise?: { date?: string; amount?: number | null; delayReasonCode?: string | null },
  ) {
    const body = bodyRaw?.trim() ?? "";
    const delayReasonCode = promise?.delayReasonCode?.trim() || null;
    if (delayReasonCode && !isDelayReasonCode(delayReasonCode)) {
      throw new BadRequestException("Invalid delayReasonCode");
    }
    const title = formatDebtCommentTitle(
      promise?.date,
      promise?.amount ?? null,
      delayReasonCode,
    );
    const hasPromise = Boolean(promise?.date && /^\d{4}-\d{2}-\d{2}$/.test(promise.date.trim()));
    const hasReason = Boolean(delayReasonCode);
    if (!body && !hasPromise && !hasReason) throw new BadRequestException("Comment body is required");
    if (body.length > 10_000) throw new BadRequestException("Comment is too long");

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(contact, actor);

    const act = await this.prisma.activity.create({
      data: {
        type: ActivityType.COMMENT,
        title,
        body: body || (hasPromise ? "Обіцяна оплата" : "Причина прострочки"),
        createdBy: actor.id,
        contactId: contact.id,
      },
      select: {
        id: true,
        body: true,
        title: true,
        createdAt: true,
        createdBy: true,
      },
    });

    const author = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { fullName: true },
    });

    const parsed = parseDebtCommentTitle(act.title);
    return {
      id: act.id,
      body: act.body,
      createdAt: act.createdAt.toISOString(),
      createdBy: act.createdBy,
      authorName: author?.fullName ?? null,
      promiseDate: parsed.promiseDate,
      promiseAmount: parsed.promiseAmount,
      delayReasonCode: parsed.delayReasonCode,
    };
  }

  async listDebtComments(actor: AuthUser, contactId: string, limit = 20) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(contact, actor);

    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.activity.findMany({
      where: {
        contactId,
        type: ActivityType.COMMENT,
        title: { startsWith: RECEIVABLES_COMMENT_TITLE },
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        body: true,
        title: true,
        createdAt: true,
        createdBy: true,
      },
    });

    const authorIds = [...new Set(rows.map((r) => r.createdBy))];
    const authors =
      authorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, fullName: true },
          })
        : [];
    const authorMap = new Map(authors.map((a) => [a.id, a.fullName]));

    return {
      items: rows.map((r) => {
        const parsed = parseDebtCommentTitle(r.title);
        return {
          id: r.id,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
          createdBy: r.createdBy,
          authorName: authorMap.get(r.createdBy) ?? null,
          promiseDate: parsed.promiseDate,
          promiseAmount: parsed.promiseAmount,
          delayReasonCode: parsed.delayReasonCode,
        };
      }),
    };
  }

  async listWorkOrders(
    actor: AuthUser,
    query: {
      page?: number;
      pageSize?: number;
      q?: string;
      ownerId?: string;
      overdue?: boolean;
      /** CRM client (Order.clientId), not TTN recipient contact. */
      contactId?: string;
      clientId?: string;
      aging?: string;
      /**
       * Contact card tab: same owner filter as the card KPI (manager sees own orders,
       * lead and admin see the client's orders). The work queue keeps dashboard scope.
       */
      cardScope?: boolean;
    },
  ) {
    const scope: AnalyticsScope = query.cardScope
      ? {
          orderScope:
            actor.role === UserRole.MANAGER ? { actor, managerId: actor.id } : { actor },
        }
      : await this.scopeService.resolveDashboardScope(actor, { managerId: query.ownerId });
    const pagination = normalizePagination(query, { page: 1, pageSize: 50 });
    const aging = parseAgingParam(query.aging);

    if (scope.emptyTeam) {
      return { items: [], total: 0, page: 1, pageSize: 50 };
    }

    const and: Prisma.OrderWhereInput[] = [buildReceivablesDebtOrderWhere(scope)];
    if (query.overdue) {
      and.push(financialOverdueWhere());
    }
    if (aging) {
      and.push(agingOrderWhere(aging));
    }
    const clientFilterId = query.clientId ?? query.contactId;
    if (clientFilterId) {
      and.push({ clientId: clientFilterId });
    }

    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { orderNumber: { contains: q, mode: "insensitive" } },
          { client: { firstName: { contains: q, mode: "insensitive" } } },
          { client: { lastName: { contains: q, mode: "insensitive" } } },
          { client: { externalCode: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    const where: Prisma.OrderWhereInput = { AND: and };
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: [{ paymentDueDate: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          orderNumber: true,
          debtAmount: true,
          creditAmount: true,
          paidAmount: true,
          totalAmount: true,
          currency: true,
          paymentDueDate: true,
          financialStatus: true,
          paymentType: true,
          legacySource: true,
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              externalCode: true,
            },
          },
          owner: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    return {
      currency,
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        debtAmount: safeNum(o.debtAmount),
        debtAmountBase: Math.round(toBaseCurrency(orderStoredAmount(o.debtAmount), o.currency, rates) * 100) / 100,
        creditAmount: safeNum(o.creditAmount),
        paidAmount: safeNum(o.paidAmount),
        totalAmount: safeNum(o.totalAmount),
        currency: o.currency,
        paymentDueDate: o.paymentDueDate?.toISOString() ?? null,
        financialStatus: o.financialStatus,
        paymentType: o.paymentType,
        clientId: o.client?.id ?? null,
        clientName: o.client
          ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ")
          : null,
        externalCode: o.client?.externalCode ?? null,
        ownerName: o.owner?.fullName ?? null,
        legacySource: o.legacySource ?? null,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  private assertContactAccess(contact: { ownerId: string | null }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && contact.ownerId && contact.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access contacts assigned to you");
    }
  }

  /**
   * Create or reuse a PENDING payment request covering the contact's full operational debt
   * (order-currency debt × UAH rate). Attached to the primary/anchor debt order; public /pay/[token] unchanged.
   */
  async ensureContactFullDebtPaymentLink(actor: AuthUser, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true, firstName: true, lastName: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(contact, actor);

    const scope = await this.scopeService.resolveDashboardScope(actor, {});
    if (scope.emptyTeam) {
      throw new BadRequestException("No operational debt for this client");
    }

    const orders = await this.prisma.order.findMany({
      where: {
        AND: [buildReceivablesDebtOrderWhere(scope), { clientId: contactId, debtAmount: { gt: 0 } }],
      },
      select: {
        id: true,
        orderNumber: true,
        debtAmount: true,
        exchangeRate: true,
        paymentDueDate: true,
        bankAccountId: true,
        currency: true,
      },
    });

    const rates = await this.settings.getExchangeRates();
    const debtOrders = orders
      .map((o) => {
        const storedRate = o.exchangeRate != null ? Number(o.exchangeRate) : null;
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          debtAmount: orderStoredAmount(o.debtAmount),
          exchangeRate:
            storedRate != null && storedRate > 0
              ? storedRate
              : computeOrderExchangeRate(o.currency, rates),
          paymentDueDate: o.paymentDueDate,
          bankAccountId: o.bankAccountId,
          currency: o.currency,
        };
      })
      .filter((o) => o.debtAmount > 0);

    if (debtOrders.length === 0) {
      throw new BadRequestException("No operational debt for this client");
    }

    const fallbackUahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;
    const amountUah = computeFullDebtPayAmountUah(debtOrders, fallbackUahPerUsd);
    if (!(amountUah > 0)) {
      throw new BadRequestException("Could not convert debt to UAH — check exchange rates on orders");
    }

    const now = new Date();
    const asOfStartOfDay = DateTime.fromISO(todayYmdKyiv(), { zone: CRM_TIME_ZONE })
      .startOf("day")
      .toJSDate();
    const anchor = pickPayLinkAnchorOrder(debtOrders, asOfStartOfDay);
    if (!anchor) {
      throw new BadRequestException(
        "No debt order with a FOP bank account — set the account on an order first",
      );
    }

    const existing = await this.prisma.paymentRequest.findMany({
      where: { orderId: anchor.id },
      orderBy: { createdAt: "desc" },
    });
    for (const row of existing) {
      if (effectivePaymentRequestStatus(row, now) !== "PENDING") continue;
      if (row.currency.toUpperCase() !== "UAH") continue;
      if (!amountsMatchForReuse(Number(row.amount), amountUah)) continue;
      return {
        publicToken: row.publicToken,
        payPath: `/pay/${row.publicToken}`,
        amount: Number(row.amount),
        currency: row.currency,
        orderId: row.orderId,
        debtOrderCount: debtOrders.length,
        debtAmountUsd: Math.round(
          debtOrders.reduce((s, o) => s + toUsd(o.debtAmount, o.currency, rates), 0) * 100,
        ) / 100,
        reused: true,
      };
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    expiresAt.setHours(23, 59, 59, 999);

    const purpose = buildFullDebtPayPurpose({
      anchorOrderNumber: String(anchor.orderNumber ?? ""),
      debtOrderCount: debtOrders.length,
    });

    const created = await this.paymentRequests.create(
      anchor.id,
      {
        amount: amountUah,
        purpose,
        expiresAt: expiresAt.toISOString(),
      },
      actor,
    );

    return {
      publicToken: created.publicToken,
      payPath: `/pay/${created.publicToken}`,
      amount: created.amount,
      currency: created.currency,
      orderId: created.orderId,
      debtOrderCount: debtOrders.length,
      debtAmountUsd: Math.round(
        debtOrders.reduce((s, o) => s + toUsd(o.debtAmount, o.currency, rates), 0) * 100,
      ) / 100,
      reused: false,
    };
  }

  /** Same position as the contact card: all of this client's orders, manager-scoped. */
  private async loadContactFinanceSnapshot(contactId: string, actor: AuthUser) {
    const rates = await this.settings.getExchangeRates();
    const where: Prisma.OrderWhereInput = { clientId: contactId };
    if (actor.role === UserRole.MANAGER) where.ownerId = actor.id;
    const [orders, balances] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          totalAmount: true,
          returnAdjustmentAmount: true,
          debtAmount: true,
          creditAmount: true,
          currency: true,
          orderStage: true,
          legacySource: true,
          paymentDueDate: true,
        },
      }),
      this.prisma.clientBalance.findMany({
        where: { holderKind: "CONTACT", holderId: contactId },
        select: { amount: true, currency: true },
      }),
    ]);
    return aggregateClientFinance(orders, balances, rates);
  }

  async getContactReceivables(
    actor: AuthUser,
    contactId: string,
    query?: { paymentsPage?: number; paymentsPageSize?: number; ordersPage?: number; ordersPageSize?: number },
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        externalCode: true,
        ownerId: true,
        receivablesSnoozedUntil: true,
        receivablesSnoozedById: true,
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(contact, actor);
    const snoozedUntil = activeSnoozeYmd(contact.receivablesSnoozedUntil, todayYmdKyiv());
    const snoozedBy =
      snoozedUntil && contact.receivablesSnoozedById
        ? await this.prisma.user.findUnique({
            where: { id: contact.receivablesSnoozedById },
            select: { fullName: true },
          })
        : null;

    const ordersResult = await this.listWorkOrders(actor, {
      clientId: contactId,
      page: query?.ordersPage ?? 1,
      pageSize: query?.ordersPageSize ?? 100,
      cardScope: true,
    });

    const finance = await this.loadContactFinanceSnapshot(contactId, actor);

    const paymentsPagination = normalizePagination(
      { page: query?.paymentsPage, pageSize: query?.paymentsPageSize },
      { page: 1, pageSize: 50 },
    );
    const paymentsWhere: Prisma.PaymentWhereInput = {
      status: "COMPLETED",
      order: { clientId: contactId },
    };
    const [paymentsTotal, paymentRows] = await Promise.all([
      this.prisma.payment.count({ where: paymentsWhere }),
      this.prisma.payment.findMany({
        where: paymentsWhere,
        skip: paymentsPagination.offset,
        take: paymentsPagination.limit,
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          currency: true,
          amountUsd: true,
          paidAt: true,
          sourceType: true,
          note: true,
          order: { select: { id: true, orderNumber: true } },
        },
      }),
    ]);

    const latestSnapshotId = await this.getLatestSnapshotId();
    let reconciliation: {
      snapshotId: string;
      snapshotDate: string;
      counterpartyCode1C: string;
      amount1C: number;
      amountCRM: number;
      delta: number;
      status: ReceivablesReconcileStatus;
    } | null = null;

    if (latestSnapshotId) {
      await this.assertSnapshotAccess(latestSnapshotId, actor);
      const normalizedCode = normalizeCounterpartyCode1C(contact.externalCode ?? "");
      const orConditions: Prisma.ReceivablesSnapshotLineWhereInput[] = [{ contactId }];
      if (normalizedCode) {
        orConditions.push({ counterpartyCode1C: normalizedCode });
      }

      const line = await this.prisma.receivablesSnapshotLine.findFirst({
        where: {
          snapshotId: latestSnapshotId,
          OR: orConditions,
        },
        include: {
          snapshot: { select: { snapshotDate: true } },
        },
      });

      if (line && !(actor.role === UserRole.MANAGER && line.status === "ONLY_1C" && !line.contactId)) {
        reconciliation = {
          snapshotId: latestSnapshotId,
          snapshotDate: line.snapshot.snapshotDate.toISOString(),
          counterpartyCode1C: line.counterpartyCode1C,
          amount1C: line.amount1C,
          amountCRM: line.amountCRM,
          delta: line.delta,
          status: line.status,
        };
      }
    }

    const comments = await this.listDebtComments(actor, contactId, 20);

    return {
      currency: finance.currency,
      externalCode: contact.externalCode,
      snoozedUntil,
      snoozedByName: snoozedBy?.fullName ?? null,
      kpi: {
        debtTotal: finance.netDebt,
        grossDebt: finance.grossDebt,
        overdueDebt: finance.overdue,
        overpaymentTotal: finance.orderCredit,
        clientBalance: finance.clientBalance,
        ordersWithDebtCount: finance.ordersWithDebtCount,
        bitrixLegacyDebt: finance.bitrixDebt,
      },
      reconciliation,
      orders: ordersResult.items,
      ordersTotal: ordersResult.total,
      payments: paymentRows.map((p) => ({
        id: p.id,
        amount: safeNum(p.amount),
        currency: p.currency,
        amountUsd: p.amountUsd != null ? safeNum(p.amountUsd) : null,
        paidAt: p.paidAt.toISOString(),
        sourceType: p.sourceType,
        note: p.note,
        orderId: p.order?.id ?? null,
        orderNumber: p.order?.orderNumber ?? null,
      })),
      paymentsTotal,
      paymentsPage: paymentsPagination.page,
      paymentsPageSize: paymentsPagination.pageSize,
      comments: comments.items,
    };
  }

  async listPeriodPayments(
    actor: AuthUser,
    query: {
      paidFrom?: string;
      paidTo?: string;
      ownerId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const scope = await this.scopeService.resolveDashboardScope(actor, { managerId: query.ownerId });
    const pagination = normalizePagination(query, { page: 1, pageSize: 50 });
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);

    if (scope.emptyTeam) {
      return { currency, items: [], total: 0, page: 1, pageSize: pagination.pageSize };
    }

    const orderFilter: Prisma.OrderWhereInput = {};
    if (scope.orderScope.managerId) orderFilter.ownerId = scope.orderScope.managerId;
    else if (scope.orderScope.allowedOwnerIds !== undefined) {
      orderFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
    }

    const paidAt: Prisma.DateTimeFilter = {};
    if (query.paidFrom) {
      const from = new Date(query.paidFrom);
      if (!Number.isNaN(from.getTime())) paidAt.gte = from;
    }
    if (query.paidTo) {
      const to = new Date(query.paidTo);
      if (!Number.isNaN(to.getTime())) paidAt.lte = to;
    }

    const where: Prisma.PaymentWhereInput = {
      status: "COMPLETED",
      ...(Object.keys(paidAt).length > 0 ? { paidAt } : {}),
      order: orderFilter,
    };

    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          currency: true,
          amountUsd: true,
          paidAt: true,
          sourceType: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              client: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    return {
      currency,
      items: rows.map((p) => ({
        id: p.id,
        amount: safeNum(p.amount),
        currency: p.currency,
        amountUsd: p.amountUsd != null ? safeNum(p.amountUsd) : null,
        paidAt: p.paidAt.toISOString(),
        sourceType: p.sourceType,
        orderId: p.order?.id ?? null,
        orderNumber: p.order?.orderNumber ?? null,
        clientId: p.order?.client?.id ?? null,
        clientName: p.order?.client
          ? [p.order.client.firstName, p.order.client.lastName].filter(Boolean).join(" ")
          : null,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}

function truncatePreview(body: string, max = 120): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
