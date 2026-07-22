import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
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
  RECEIVABLES_DELTA_TOLERANCE,
  RECEIVABLES_DEBT_ORDER_STAGES,
  type Receivables1CCurrency,
} from "./receivables.constants";
import {
  aggregateReceivablesRows,
  normalizeCounterpartyCode1C,
  parseReceivablesExcel,
} from "./receivables-excel.parser";
import { financialOverdueWhere } from "../orders/order-status-sync.mapper";
import {
  buildBitrixLegacyDebtOrderWhere,
  buildOverdueDebtOrderWhere,
  buildReceivablesDebtOrderWhere,
  computeReconcileStatus,
  excludeBitrixLegacyWhere,
  isReceivablesDeltaStatus,
} from "./receivables-scope.util";

type ContactDebtRow = {
  contactId: string;
  externalCode: string;
  debtBase: number;
  overdueBase: number;
  orderCount: number;
  ownerId: string | null;
  firstName: string;
  lastName: string;
};

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
    rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
  ) {
    const orderWhere: Prisma.OrderWhereInput = scope
      ? buildReceivablesDebtOrderWhere(scope)
      : {
          AND: [
            {
              debtAmount: { gt: 0 },
              clientId: { not: null },
              orderStage: { in: [...RECEIVABLES_DEBT_ORDER_STAGES] },
            },
            excludeBitrixLegacyWhere(),
          ],
        };

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        clientId: true,
        debtAmount: true,
        currency: true,
        financialStatus: true,
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

    const map = new Map<string, ContactDebtRow>();
    for (const o of orders) {
      const client = o.client;
      if (!client) continue;
      const debtBase = toBaseCurrency(safeNum(o.debtAmount), o.currency, rates);
      const overdueBase =
        o.financialStatus === "OVERDUE" && safeNum(o.debtAmount) > 0 ? debtBase : 0;
      const code = normalizeCounterpartyCode1C(client.externalCode ?? "");
      const prev = map.get(client.id);
      if (prev) {
        prev.debtBase += debtBase;
        prev.overdueBase += overdueBase;
        prev.orderCount += 1;
      } else {
        map.set(client.id, {
          contactId: client.id,
          externalCode: code,
          debtBase,
          overdueBase,
          orderCount: 1,
          ownerId: client.ownerId,
          firstName: client.firstName,
          lastName: client.lastName,
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
    rates: Awaited<ReturnType<SettingsService["getExchangeRates"]>>,
  ): Promise<number> {
    const rows = await this.prisma.order.findMany({
      where,
      select: { debtAmount: true, currency: true },
    });
    let total = 0;
    for (const row of rows) {
      total += toBaseCurrency(safeNum(row.debtAmount), row.currency, rates);
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
      orderCount: row.orderCount,
      ownerId: row.ownerId,
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

    items.sort((a, b) => b.debtAmount - a.debtAmount);

    const pagination = normalizePagination(query, { page: 1, pageSize: 50 });
    const total = items.length;
    const pageItems = items.slice(pagination.offset, pagination.offset + pagination.limit);

    const ownerIds = [...new Set(pageItems.map((i) => i.ownerId).filter(Boolean))] as string[];
    const owners =
      ownerIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, fullName: true },
          })
        : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o.fullName]));

    return {
      currency,
      items: pageItems.map((i) => ({
        ...i,
        ownerName: i.ownerId ? (ownerMap.get(i.ownerId) ?? null) : null,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
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
      contactId?: string;
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
    if (query.contactId) {
      and.push({ clientId: query.contactId });
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
        debtAmountBase: toBaseCurrency(safeNum(o.debtAmount), o.currency, rates),
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

  async getContactReceivables(actor: AuthUser, contactId: string) {
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
      contactId,
      page: 1,
      pageSize: 100,
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
    for (const order of ordersResult.items) {
      debtTotal += order.debtAmountBase;
      if (order.financialStatus === "OVERDUE") {
        overdueDebt += order.debtAmountBase;
      }
    }

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

    return {
      currency: ordersResult.currency,
      externalCode: contact.externalCode,
      kpi: {
        debtTotal: Math.round(debtTotal * 100) / 100,
        overdueDebt: Math.round(overdueDebt * 100) / 100,
        ordersWithDebtCount: ordersResult.total,
        bitrixLegacyDebt: Math.round(bitrixLegacyDebt * 100) / 100,
      },
      reconciliation,
      orders: ordersResult.items,
      ordersTotal: ordersResult.total,
    };
  }
}
