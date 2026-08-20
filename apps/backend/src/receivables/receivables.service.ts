import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActivityType,
  ReceivablesReconcileStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsScopeService } from "../analytics/analytics-scope.service";
import { getBaseCurrency, toBaseCurrency } from "../common/currency.util";
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
import { financialOverdueWhere } from "../orders/order-status-sync.mapper";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../crm-timezone";
import {
  buildBitrixLegacyDebtOrderWhere,
  buildOperationalDebtOrderWhere,
  buildOverdueDebtOrderWhere,
  buildReceivablesDebtOrderWhere,
  computeReconcileStatus,
  isReceivablesDeltaStatus,
} from "./receivables-scope.util";

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
  lastPaymentAt: Date | null;
};

/** debtAmount / creditAmount on Order are stored in USD (see recalcOrder). */
function orderStoredUsdAmount(value: unknown): number {
  return safeNum(value);
}

function isOrderOverdueByDueDate(
  paymentDueDate: Date | null | undefined,
  debtAmount: number,
): boolean {
  if (!(debtAmount > 0) || !paymentDueDate) return false;
  const startOfToday = DateTime.fromISO(todayYmdKyiv(), { zone: CRM_TIME_ZONE }).startOf("day");
  return paymentDueDate < startOfToday.toJSDate();
}

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly scopeService: AnalyticsScopeService,
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
    await this.assertSnapshotAccess(snapshotId, actor);
    await this.reconcileSnapshot(snapshotId);
    return this.getReconciliationSummary(snapshotId, actor);
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
    const contacts = await this.prisma.contact.findMany({
      where: { externalCode: { not: null } },
      select: {
        id: true,
        externalCode: true,
        ownerId: true,
        firstName: true,
        lastName: true,
      },
    });

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
      if (!row.externalCode || codesIn1C.has(row.externalCode)) continue;
      const amountCRM = row.debtBase;
      if (amountCRM <= tolerance) continue;
      totalCRM += amountCRM;
      const status: ReceivablesReconcileStatus = "ONLY_CRM";
      deltaCount += 1;
      reconcileLines.push({
        counterpartyCode1C: row.externalCode,
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

  private async loadContactDebtMap(
    scope: Awaited<ReturnType<AnalyticsScopeService["resolveDashboardScope"]>> | null,
    _rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
  ) {
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
          },
        },
      },
    });

    const clientIds = [...new Set(orders.map((o) => o.clientId).filter(Boolean))] as string[];
    const lastPaymentByClient = new Map<string, Date>();
    if (clientIds.length > 0) {
      const paymentRows = await this.prisma.payment.findMany({
        where: {
          status: "COMPLETED",
          order: { clientId: { in: clientIds } },
        },
        select: { paidAt: true, order: { select: { clientId: true } } },
      });
      for (const p of paymentRows) {
        const cid = p.order?.clientId;
        if (!cid) continue;
        const prev = lastPaymentByClient.get(cid);
        if (!prev || p.paidAt > prev) lastPaymentByClient.set(cid, p.paidAt);
      }
    }

    const map = new Map<string, ContactDebtRow>();
    for (const o of orders) {
      const client = o.client;
      if (!client) continue;
      const debtUsd = orderStoredUsdAmount(o.debtAmount);
      const creditUsd = orderStoredUsdAmount(o.creditAmount);
      const debtBase = debtUsd > 0 ? debtUsd : 0;
      const creditBase = creditUsd > 0 ? creditUsd : 0;
      const overdueBase = isOrderOverdueByDueDate(o.paymentDueDate, debtUsd) ? debtBase : 0;
      const code = normalizeCounterpartyCode1C(client.externalCode ?? "");
      const prev = map.get(client.id);
      if (prev) {
        prev.debtBase += debtBase;
        prev.overdueBase += overdueBase;
        prev.creditBase += creditBase;
        prev.orderCount += 1;
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
          lastPaymentAt: lastPaymentByClient.get(client.id) ?? null,
        });
      }
    }
    for (const row of map.values()) {
      if (!row.lastPaymentAt) {
        row.lastPaymentAt = lastPaymentByClient.get(row.contactId) ?? null;
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
    let managerDeltaCount = 0;

    for (const line of lines) {
      if (actor.role === UserRole.MANAGER && line.status === "ONLY_1C") continue;
      total1C += line.amount1C;
      totalCRM += line.amountCRM;
      if (isReceivablesDeltaStatus(line.status)) {
        deltaCount += 1;
        managerDeltaCount += 1;
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
        managerDeltaCount,
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

    if (query.deltasOnly) {
      and.push({ status: { not: "ALIGNED" } });
    } else if (query.status) {
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
        },
      };
    }

    const debtWhere = buildReceivablesDebtOrderWhere(scope);
    const bitrixDebtWhere = buildBitrixLegacyDebtOrderWhere(scope);
    const contactDebt = await this.loadContactDebtMap(scope, rates);

    let debtTotal = 0;
    let overdueDebt = 0;
    for (const row of contactDebt.values()) {
      debtTotal += row.debtBase;
      overdueDebt += row.overdueBase;
    }

    const [ordersWithDebtCount, bitrixLegacyOrdersCount, bitrixLegacyDebt] = await Promise.all([
      this.prisma.order.count({ where: debtWhere }),
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

    return {
      currency,
      reconciliation,
      kpi: {
        debtTotal: Math.round(debtTotal * 100) / 100,
        overdueDebt: Math.round(overdueDebt * 100) / 100,
        clientsWithDebtCount: contactDebt.size,
        ordersWithDebtCount,
        bitrixLegacyDebt: Math.round(bitrixLegacyDebt * 100) / 100,
        bitrixLegacyOrdersCount,
      },
    };
  }

  private async sumOrderDebtBase(
    where: Prisma.OrderWhereInput,
    _rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
  ): Promise<number> {
    const rows = await this.prisma.order.findMany({
      where,
      select: { debtAmount: true },
    });
    let total = 0;
    for (const row of rows) {
      total += orderStoredUsdAmount(row.debtAmount);
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
    },
  ) {
    const scope = await this.scopeService.resolveDashboardScope(actor, { managerId: query.ownerId });
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);

    if (scope.emptyTeam) {
      return { currency, items: [], total: 0, page: 1, pageSize: 50 };
    }

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
    }));

    if (query.overdue) {
      items = items.filter((i) => i.overdueAmount > 0);
    }

    const q = query.q?.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) =>
          i.clientName.toLowerCase().includes(q) ||
          (i.externalCode?.toLowerCase().includes(q) ?? false),
      );
    }

    const lastCommentByContact = await this.loadLastDebtComments(items.map((i) => i.contactId));

    if (query.needsComment) {
      const staleBefore = new Date(
        Date.now() - RECEIVABLES_COMMENT_STALE_DAYS * 24 * 60 * 60 * 1000,
      );
      items = items.filter((i) => {
        const last = lastCommentByContact.get(i.contactId);
        return !last || last.createdAt < staleBefore;
      });
    }

    items.sort((a, b) => b.debtAmount - a.debtAmount);

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
    const userIds = [...new Set([...ownerIds, ...authorIds])];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          })
        : [];
    const userMap = new Map(users.map((o) => [o.id, o.fullName]));

    return {
      currency,
      items: pageItems.map((i) => {
        const last = lastCommentByContact.get(i.contactId) ?? null;
        return {
          ...i,
          ownerName: i.ownerId ? (userMap.get(i.ownerId) ?? null) : null,
          lastCommentAt: last?.createdAt.toISOString() ?? null,
          lastCommentPreview: last ? truncatePreview(last.body) : null,
          lastCommentAuthorName: last ? (userMap.get(last.createdBy) ?? null) : null,
        };
      }),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  private async loadLastDebtComments(contactIds: string[]) {
    const uniqueIds = [...new Set(contactIds.filter(Boolean))];
    const map = new Map<string, { body: string; createdAt: Date; createdBy: string }>();
    if (uniqueIds.length === 0) return map;

    const rows = await this.prisma.activity.findMany({
      where: {
        contactId: { in: uniqueIds },
        type: ActivityType.COMMENT,
        title: RECEIVABLES_COMMENT_TITLE,
      },
      orderBy: { createdAt: "desc" },
      select: {
        contactId: true,
        body: true,
        createdAt: true,
        createdBy: true,
      },
    });

    for (const row of rows) {
      if (!row.contactId || map.has(row.contactId)) continue;
      map.set(row.contactId, {
        body: row.body,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      });
    }
    return map;
  }

  async addDebtComment(actor: AuthUser, contactId: string, bodyRaw: string) {
    const body = bodyRaw?.trim() ?? "";
    if (!body) throw new BadRequestException("Comment body is required");
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
        title: RECEIVABLES_COMMENT_TITLE,
        body,
        createdBy: actor.id,
        contactId: contact.id,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        createdBy: true,
      },
    });

    const author = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { fullName: true },
    });

    return {
      id: act.id,
      body: act.body,
      createdAt: act.createdAt.toISOString(),
      createdBy: act.createdBy,
      authorName: author?.fullName ?? null,
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
        title: RECEIVABLES_COMMENT_TITLE,
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        body: true,
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
      items: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.createdBy,
        authorName: authorMap.get(r.createdBy) ?? null,
      })),
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
    },
  ) {
    const scope = await this.scopeService.resolveDashboardScope(actor, { managerId: query.ownerId });
    const pagination = normalizePagination(query, { page: 1, pageSize: 50 });

    if (scope.emptyTeam) {
      return { items: [], total: 0, page: 1, pageSize: 50 };
    }

    const and: Prisma.OrderWhereInput[] = [buildReceivablesDebtOrderWhere(scope)];
    if (query.overdue) {
      and.push(financialOverdueWhere());
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
        debtAmountBase: orderStoredUsdAmount(o.debtAmount),
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
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(contact, actor);

    const ordersResult = await this.listWorkOrders(actor, {
      clientId: contactId,
      page: query?.ordersPage ?? 1,
      pageSize: query?.ordersPageSize ?? 100,
    });

    const scope = await this.scopeService.resolveDashboardScope(actor, {});
    const rates = await this.settings.getExchangeRates();
    const bitrixLegacyDebt = scope.emptyTeam
      ? 0
      : await this.sumOrderDebtBase(
          {
            AND: [
              buildBitrixLegacyDebtOrderWhere(scope),
              { clientId: contactId },
            ],
          },
          rates,
        );

    let debtTotal = 0;
    let overdueDebt = 0;
    let overpaymentTotal = 0;
    for (const order of ordersResult.items) {
      debtTotal += order.debtAmountBase;
      overpaymentTotal += order.creditAmount ?? 0;
      if (
        isOrderOverdueByDueDate(
          order.paymentDueDate ? new Date(order.paymentDueDate) : null,
          order.debtAmount,
        )
      ) {
        overdueDebt += order.debtAmountBase;
      }
    }

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
      currency: ordersResult.currency,
      externalCode: contact.externalCode,
      kpi: {
        debtTotal: Math.round(debtTotal * 100) / 100,
        overdueDebt: Math.round(overdueDebt * 100) / 100,
        overpaymentTotal: Math.round(overpaymentTotal * 100) / 100,
        ordersWithDebtCount: ordersResult.total,
        bitrixLegacyDebt: Math.round(bitrixLegacyDebt * 100) / 100,
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
