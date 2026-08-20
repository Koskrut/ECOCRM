import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import {
  BankTransactionMatchStatus,
  PaymentMatchDecision,
  PaymentSourceType,
  PaymentStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { BankAccountsService } from "../bank/bank-accounts.service";
import {
  allocationExceedsTransaction,
  BANK_ALLOCATION_EPSILON,
  lockBankTransactionForUpdate,
  remainingBankTransactionAmount,
  sumBankTransactionAllocations,
} from "../bank/bank-allocation.util";
import { MatchSuggestionService } from "../bank/match-suggestion.service";
import { PayerAliasService } from "../bank/payer-alias.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AllocateMatchMetaDto, AllocatePaymentDto } from "./dto/allocate-payment.dto";
import type { AllocateSplitDto } from "./dto/allocate-split.dto";
import type { CreateCashPaymentDto } from "./dto/create-cash-payment.dto";
import type { UpdatePaymentDto } from "./dto/update-payment.dto";
import type { SplitPaymentDto } from "./dto/split-payment.dto";
import type { TransferCreditDto } from "./dto/transfer-credit.dto";
import type { ExchangeRates } from "../settings/settings.service";
import { SettingsService } from "../settings/settings.service";
import { toUsd } from "../common/currency.util";
import { buildPaymentSearchWhere } from "./payment-search.util";
import { roundMoney } from "./order-finance.utils";
import { cashPaymentConfirmDedupWindow } from "./cash-payment-dedup.util";
import { paymentAuditSnapshot, writePaymentChangeAudit } from "./payment-audit.util";
import { recalcOrderFinance } from "./order-finance.recalc";
import { randomUUID } from "node:crypto";

export type AllocateMatchMeta = AllocateMatchMetaDto;

function convertToUsd(amount: number, currency: string, rates: ExchangeRates): number {
  return toUsd(amount, currency, rates);
}

/** Prefer TTN contact, fallback to legacy client on order. */
function formatOrderContactLabel(order: {
  contact: { firstName: string; lastName: string; phone: string } | null;
  client: { firstName: string; lastName: string; phone: string } | null;
} | null): string | null {
  if (!order) return null;
  const c = order.contact ?? order.client;
  if (!c) return null;
  const name = [c.lastName, c.firstName].filter(Boolean).join(" ").trim();
  const phone = (c.phone ?? "").trim();
  if (name && phone) return `${name} · ${phone}`;
  if (name) return name;
  if (phone) return phone;
  return null;
}

type ListPaymentsParams = {
  bankAccountId?: string;
  q?: string;
  sourceType?: PaymentSourceType;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly bankAccounts: BankAccountsService,
    private readonly audit: AuditService,
    @Optional()
    @Inject(forwardRef(() => PayerAliasService))
    private readonly payerAliases?: PayerAliasService,
    @Optional()
    @Inject(forwardRef(() => MatchSuggestionService))
    private readonly matchSuggestions?: MatchSuggestionService,
  ) {}

  async getMatchSuggestionsForTransaction(transactionId: string, actor?: AuthUser) {
    if (!transactionId?.trim()) {
      throw new BadRequestException("transactionId is required");
    }
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { payments: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    await this.ensureCanUseBankTransaction(tx.bankAccountId, actor);
    if (!this.matchSuggestions) {
      throw new BadRequestException("Match suggestions unavailable");
    }
    return this.matchSuggestions.getSuggestions(tx);
  }

  async syncBankTransactionMatchStatus(bankTransactionId: string): Promise<void> {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      include: { payments: { select: { amount: true, status: true } } },
    });
    if (!tx) return;
    if (
      tx.matchStatus === BankTransactionMatchStatus.TECHNICAL ||
      tx.matchStatus === BankTransactionMatchStatus.IGNORED
    ) {
      return;
    }
    const txAmount = Number(tx.amount);
    const allocated = sumBankTransactionAllocations(tx.payments);
    const remaining = remainingBankTransactionAmount(txAmount, tx.payments);
    let matchStatus = tx.matchStatus;
    if (allocated <= BANK_ALLOCATION_EPSILON) {
      if (
        matchStatus === BankTransactionMatchStatus.MATCHED ||
        matchStatus === BankTransactionMatchStatus.AUTO_MATCHED ||
        matchStatus === BankTransactionMatchStatus.PARTIALLY_MATCHED
      ) {
        matchStatus = BankTransactionMatchStatus.UNMATCHED;
      }
    } else if (remaining > 0) {
      matchStatus = BankTransactionMatchStatus.PARTIALLY_MATCHED;
    } else if (
      matchStatus !== BankTransactionMatchStatus.AUTO_MATCHED &&
      matchStatus !== BankTransactionMatchStatus.MATCHED
    ) {
      matchStatus = BankTransactionMatchStatus.MATCHED;
    }
    if (matchStatus !== tx.matchStatus) {
      await this.prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { matchStatus },
      });
    }
  }

  private async learnAliasFromOrders(
    bankTransactionId: string,
    orderIds: string[],
    matchMeta?: AllocateMatchMeta,
    actorUserId?: string | null,
    paymentIds?: string[],
  ): Promise<void> {
    if (!this.payerAliases) return;
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      select: { counterpartyIban: true, counterpartyName: true },
    });
    const order = await this.prisma.order.findFirst({
      where: { id: { in: orderIds } },
      select: { contactId: true, clientId: true, companyId: true },
    });
    if (tx && order) {
      await this.payerAliases.learnFromAllocation({
        contactId: order.contactId ?? order.clientId,
        companyId: order.companyId,
        counterpartyIban: tx.counterpartyIban,
        counterpartyName: tx.counterpartyName,
      });
    }
    if (paymentIds?.length) {
      const decisionRaw = matchMeta?.decision ?? PaymentMatchDecision.MANUAL;
      const decisionLabel = String(decisionRaw);
      const decision: PaymentMatchDecision =
        decisionLabel === "AUTO"
          ? PaymentMatchDecision.AUTO
          : decisionLabel === "SUGGESTED"
            ? PaymentMatchDecision.SUGGESTED
            : PaymentMatchDecision.MANUAL;
      await this.payerAliases.writeAudit({
        bankTransactionId,
        paymentIds,
        decision,
        matchReason: matchMeta?.matchReason ?? null,
        reasons: matchMeta?.reasons ?? (matchMeta?.confirmSuggestionId
          ? { confirmSuggestionId: matchMeta.confirmSuggestionId }
          : undefined),
        score: matchMeta?.score ?? null,
        createdByUserId: actorUserId ?? null,
      });
    }
  }

  private async ensureCanUseBankTransaction(txBankAccountId: string, actor?: AuthUser): Promise<void> {
    if (!actor || actor.role === UserRole.ADMIN) return;
    const visibleIds = await this.bankAccounts.getVisibleBankAccountIds(actor.id);
    if (!visibleIds.includes(txBankAccountId)) {
      throw new ForbiddenException("You do not have access to this bank account");
    }
  }

  async list(params: ListPaymentsParams, actor?: AuthUser) {
    let rates: ExchangeRates;
    try {
      rates = await this.settings.getExchangeRates();
    } catch (e) {
      this.logger.warn(`getExchangeRates failed, using defaults: ${e}`);
      rates = { UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 };
    }

    let where: Prisma.PaymentWhereInput = {};
    if (actor && actor.role !== UserRole.ADMIN) {
      const visibleIds = await this.bankAccounts.getVisibleBankAccountIds(actor.id);
      if (params.bankAccountId) {
        if (!visibleIds.includes(params.bankAccountId)) {
          throw new ForbiddenException("You do not have access to this bank account");
        }
      }
      const bankAccountIdFilter: Prisma.StringFilter | string = params.bankAccountId
        ? params.bankAccountId
        : visibleIds.length > 0
          ? { in: visibleIds }
          : { in: [] };
      const bankBranch: Prisma.PaymentWhereInput = {
        sourceType: PaymentSourceType.BANK,
        bankTransaction:
          typeof bankAccountIdFilter === "string"
            ? { bankAccountId: bankAccountIdFilter }
            : { bankAccountId: bankAccountIdFilter },
      };
      const cashBranch: Prisma.PaymentWhereInput =
        actor.role === UserRole.MANAGER
          ? { sourceType: PaymentSourceType.CASH, order: { ownerId: actor.id } }
          : { sourceType: PaymentSourceType.CASH };
      where = { OR: [bankBranch, cashBranch] };
    } else if (params.bankAccountId) {
      where = { bankTransaction: { bankAccountId: params.bankAccountId } };
    }

    const searchQ = params.q?.trim();
    if (searchQ) {
      const searchWhere = buildPaymentSearchWhere(searchQ);
      where =
        Object.keys(where).length === 0 ? searchWhere : { AND: [where, searchWhere] };
    }

    if (params.sourceType) {
      const sourceFilter: Prisma.PaymentWhereInput = { sourceType: params.sourceType };
      where =
        Object.keys(where).length === 0 ? sourceFilter : { AND: [where, sourceFilter] };
    }

    if (params.dateFrom || params.dateTo) {
      const paidAt: Prisma.DateTimeFilter = {};
      if (params.dateFrom) {
        const from = new Date(params.dateFrom);
        if (!Number.isNaN(from.getTime())) paidAt.gte = from;
      }
      if (params.dateTo) {
        const to = new Date(params.dateTo);
        if (!Number.isNaN(to.getTime())) {
          const hasTime = params.dateTo.includes("T");
          if (!hasTime) to.setHours(23, 59, 59, 999);
          paidAt.lte = to;
        }
      }
      if (paidAt.gte || paidAt.lte) {
        const dateFilter: Prisma.PaymentWhereInput = { paidAt };
        where =
          Object.keys(where).length === 0 ? dateFilter : { AND: [where, dateFilter] };
      }
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          orderBy: { paidAt: "desc" },
          skip: params.offset,
          take: params.limit,
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                contact: { select: { firstName: true, lastName: true, phone: true } },
                client: { select: { firstName: true, lastName: true, phone: true } },
              },
            },
            bankTransaction: {
              select: {
                id: true,
                bankAccountId: true,
                bookedAt: true,
                description: true,
                counterpartyName: true,
                matchStatus: true,
                bankAccount: { select: { id: true, name: true, currency: true } },
              },
            },
            createdBy: { select: { id: true, fullName: true } },
          },
        }),
        this.prisma.payment.count({ where }),
      ]);

      const txIds = [...new Set(items.map((p) => p.bankTransactionId).filter(Boolean))] as string[];
    const ordersByTx =
      txIds.length > 0
        ? await this.prisma.payment.findMany({
            where: { bankTransactionId: { in: txIds } },
            select: {
              bankTransactionId: true,
              orderId: true,
              order: { select: { orderNumber: true } },
            },
          })
        : [];
    const txOrderNumbers = new Map<string, string[]>();
    for (const row of ordersByTx) {
      if (!row.bankTransactionId) continue;
      const list = txOrderNumbers.get(row.bankTransactionId) ?? [];
      const num = row.order?.orderNumber ?? row.orderId;
      if (!list.includes(num)) list.push(num);
      txOrderNumbers.set(row.bankTransactionId, list);
    }

    return {
      items: items.map((p) => {
        const amount = Number(p.amount);
        const currency = p.currency || "USD";
        const amountUsd =
          p.amountUsd != null ? Number(p.amountUsd) : convertToUsd(amount, currency, rates);
        const sameTransactionOrderNumbers = p.bankTransactionId
          ? txOrderNumbers.get(p.bankTransactionId) ?? []
          : null;
        return {
          id: p.id,
          orderId: p.orderId,
          orderNumber: p.order?.orderNumber ?? null,
          contactLabel: formatOrderContactLabel(p.order),
          sameTransactionOrderNumbers,
          sourceType: p.sourceType,
          amount,
          currency,
          amountUsd,
          paidAt: p.paidAt,
          status: p.status,
          note: p.note,
          bankTransaction: p.bankTransaction
            ? {
              id: p.bankTransaction.id,
              bankAccountId: p.bankTransaction.bankAccountId,
              bankAccount: p.bankTransaction.bankAccount,
              bookedAt: p.bankTransaction.bookedAt,
              description: p.bankTransaction.description,
              counterpartyName: p.bankTransaction.counterpartyName,
              matchStatus: p.bankTransaction.matchStatus,
            }
            : null,
          createdBy: p.createdBy,
        };
      }),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
    } catch (e) {
      this.logger.error(`payments.list failed: ${e}`);
      return {
        items: [],
        total: 0,
        page: params.page,
        pageSize: params.pageSize,
      };
    }
  }

  async listByOrderId(orderId: string, actor?: AuthUser) {
    const [order, rates] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, ownerId: true },
      }),
      this.settings.getExchangeRates(),
    ]);
    if (!order) throw new NotFoundException("Order not found");
    if (actor?.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { paidAt: "desc" },
      include: {
        bankTransaction: {
          select: {
            id: true,
            bankAccountId: true,
            bookedAt: true,
            description: true,
            counterpartyName: true,
          },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    const txIds = [...new Set(payments.map((p) => p.bankTransactionId).filter(Boolean))] as string[];
    const ordersByTx =
      txIds.length > 0
        ? await this.prisma.payment.findMany({
            where: { bankTransactionId: { in: txIds } },
            select: {
              bankTransactionId: true,
              orderId: true,
              order: { select: { orderNumber: true } },
            },
          })
        : [];
    const txOrderNumbers = new Map<string, string[]>();
    for (const row of ordersByTx) {
      if (!row.bankTransactionId) continue;
      const list = txOrderNumbers.get(row.bankTransactionId) ?? [];
      const num = row.order?.orderNumber ?? row.orderId;
      if (!list.includes(num)) list.push(num);
      txOrderNumbers.set(row.bankTransactionId, list);
    }
    return payments.map((p) => {
      const amount = Number(p.amount);
      const currency = p.currency || "USD";
      const amountUsd =
        p.amountUsd != null ? Number(p.amountUsd) : convertToUsd(amount, currency, rates);
      const sameTransactionOrderNumbers = p.bankTransactionId
        ? txOrderNumbers.get(p.bankTransactionId) ?? []
        : null;
      return {
        id: p.id,
        orderId: p.orderId,
        sourceType: p.sourceType,
        amount,
        currency,
        amountUsd,
        sameTransactionOrderNumbers,
        paidAt: p.paidAt,
        status: p.status,
        note: p.note,
        bankTransaction: p.bankTransaction,
        createdBy: p.createdBy,
      };
    });
  }

  async allocate(dto: AllocatePaymentDto, actor?: AuthUser) {
    if (
      !actor ||
      (actor.role !== UserRole.ADMIN &&
        actor.role !== UserRole.LEAD &&
        actor.role !== UserRole.MANAGER)
    ) {
      throw new ForbiddenException("You are not allowed to allocate bank transactions");
    }
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: dto.transactionId },
      include: { payments: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    await this.ensureCanUseBankTransaction(tx.bankAccountId, actor);

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only allocate to orders assigned to you");
    }

    const txAmount = Number(tx.amount);
    const remaining = remainingBankTransactionAmount(txAmount, tx.payments);
    if (remaining <= 0) {
      throw new BadRequestException("Transaction already fully allocated");
    }
    const requestedAmount = dto.amount != null ? dto.amount : remaining;
    if (requestedAmount <= 0) throw new BadRequestException("Amount must be positive");

    const rates = await this.settings.getExchangeRates();

    let paymentId: string | null = null;
    await this.prisma.$transaction(async (db) => {
      await lockBankTransactionForUpdate(db, dto.transactionId);
      const lockedTx = await db.bankTransaction.findUnique({
        where: { id: dto.transactionId },
        include: { payments: true },
      });
      if (!lockedTx) throw new NotFoundException("Transaction not found");
      const allocated = sumBankTransactionAllocations(lockedTx.payments);
      const lockedRemaining = remainingBankTransactionAmount(txAmount, lockedTx.payments);
      if (lockedRemaining <= 0) {
        throw new BadRequestException("Transaction already fully allocated");
      }
      const amount = dto.amount != null ? requestedAmount : lockedRemaining;
      if (amount > lockedRemaining + BANK_ALLOCATION_EPSILON) {
        throw new BadRequestException("Amount exceeds remaining allocation");
      }
      if (allocationExceedsTransaction(allocated, amount, txAmount)) {
        throw new BadRequestException("Transaction amount would be exceeded");
      }

      const amountUsd = convertToUsd(amount, lockedTx.currency, rates);
      const payment = await db.payment.create({
        data: {
          orderId: dto.orderId,
          sourceType: PaymentSourceType.BANK,
          amount,
          currency: lockedTx.currency,
          amountUsd,
          paidAt: lockedTx.bookedAt,
          status: PaymentStatus.COMPLETED,
          bankTransactionId: lockedTx.id,
          createdByUserId: actor?.id ?? null,
        },
      });
      paymentId = payment.id;
    });

    await this.recalcOrder(dto.orderId);
    await this.syncBankTransactionMatchStatus(dto.transactionId);
    const meta: AllocateMatchMeta = {
      ...(dto.matchMeta ?? {}),
      confirmSuggestionId: dto.confirmSuggestionId ?? dto.matchMeta?.confirmSuggestionId,
      decision: dto.matchMeta?.decision ?? PaymentMatchDecision.MANUAL,
    };
    await this.learnAliasFromOrders(
      dto.transactionId,
      [dto.orderId],
      meta,
      actor?.id,
      paymentId ? [paymentId] : undefined,
    );
    return this.listByOrderId(dto.orderId, actor);
  }

  async allocateSplit(dto: AllocateSplitDto, actor?: AuthUser) {
    if (
      !actor ||
      (actor.role !== UserRole.ADMIN &&
        actor.role !== UserRole.LEAD &&
        actor.role !== UserRole.MANAGER)
    ) {
      throw new ForbiddenException("You are not allowed to allocate bank transactions");
    }
    await this.allocateSplitInternal({
      transactionId: dto.transactionId,
      allocations: dto.allocations,
      actorUserId: actor.id,
      actor,
      matchMeta: {
        ...(dto.matchMeta ?? {}),
        confirmSuggestionId: dto.confirmSuggestionId ?? dto.matchMeta?.confirmSuggestionId,
        decision: dto.matchMeta?.decision ?? PaymentMatchDecision.MANUAL,
      },
    });
    return this.list({ page: 1, pageSize: 50, offset: 0, limit: 50 }, actor);
  }

  /**
   * Core split allocation used by API and system multi-order auto-match.
   * Sum of new allocations must equal remaining amount (full tx when nothing allocated yet).
   */
  async allocateSplitInternal(input: {
    transactionId: string;
    allocations: Array<{ orderId: string; amount: number }>;
    actorUserId?: string | null;
    actor?: AuthUser;
    matchMeta?: AllocateMatchMeta;
  }): Promise<string[]> {
    if (!input.allocations?.length) {
      throw new BadRequestException("At least one allocation required");
    }
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: input.transactionId },
      include: { payments: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    if (input.actor) {
      await this.ensureCanUseBankTransaction(tx.bankAccountId, input.actor);
    }

    const txAmount = Number(tx.amount);
    const alreadyAllocated = sumBankTransactionAllocations(tx.payments);
    const remaining = remainingBankTransactionAmount(txAmount, tx.payments);
    if (remaining <= 0) {
      throw new BadRequestException("Transaction already fully allocated");
    }

    const totalAlloc = input.allocations.reduce((s, a) => s + Number(a.amount), 0);
    if (Math.abs(totalAlloc - remaining) > BANK_ALLOCATION_EPSILON) {
      throw new BadRequestException(
        `Total allocated ${totalAlloc} must equal remaining amount ${remaining}` +
          (alreadyAllocated > 0 ? ` (tx ${txAmount}, already ${alreadyAllocated})` : ` (tx ${txAmount})`),
      );
    }

    for (const a of input.allocations) {
      const amount = Number(a.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException("Each allocation amount must be positive");
      }
      const order = await this.prisma.order.findUnique({ where: { id: a.orderId } });
      if (!order) throw new NotFoundException(`Order not found: ${a.orderId}`);
      if (input.actor?.role === UserRole.MANAGER && order.ownerId !== input.actor.id) {
        throw new ForbiddenException("You can only assign to orders assigned to you");
      }
    }

    const rates = await this.settings.getExchangeRates();
    const paymentIds: string[] = [];

    await this.prisma.$transaction(async (db) => {
      await lockBankTransactionForUpdate(db, input.transactionId);
      const lockedTx = await db.bankTransaction.findUnique({
        where: { id: input.transactionId },
        include: { payments: true },
      });
      if (!lockedTx) throw new NotFoundException("Transaction not found");
      const allocatedTotal = sumBankTransactionAllocations(lockedTx.payments ?? []);
      const lockedRemaining = remainingBankTransactionAmount(txAmount, lockedTx.payments ?? []);
      if (Math.abs(totalAlloc - lockedRemaining) > BANK_ALLOCATION_EPSILON) {
        throw new BadRequestException("Transaction remaining amount changed; retry");
      }
      if (allocationExceedsTransaction(allocatedTotal, totalAlloc, txAmount)) {
        throw new BadRequestException("Transaction amount would be exceeded");
      }

      for (const a of input.allocations) {
        const amt = Number(a.amount);
        const amountUsd = convertToUsd(amt, lockedTx.currency, rates);
        const payment = await db.payment.create({
          data: {
            orderId: a.orderId,
            sourceType: PaymentSourceType.BANK,
            amount: amt,
            currency: lockedTx.currency,
            amountUsd,
            paidAt: lockedTx.bookedAt,
            status: PaymentStatus.COMPLETED,
            bankTransactionId: lockedTx.id,
            createdByUserId: input.actorUserId ?? null,
          },
        });
        paymentIds.push(payment.id);
      }
    });

    for (const a of input.allocations) {
      await this.recalcOrder(a.orderId);
    }
    await this.syncBankTransactionMatchStatus(input.transactionId);
    await this.learnAliasFromOrders(
      input.transactionId,
      input.allocations.map((a) => a.orderId),
      input.matchMeta,
      input.actorUserId,
      paymentIds,
    );
    return paymentIds;
  }

  async createCash(dto: CreateCashPaymentDto, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, ownerId: true, currency: true, clientId: true, contactId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor?.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only add payments to orders assigned to you");
    }
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Amount must be a positive number");
    }
    const paidAt = new Date(dto.paidAt);
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException("Invalid paidAt date");
    }

    const currency = (dto.currency && dto.currency.trim().toUpperCase()) || order.currency;
    if (!["USD", "UAH", "EUR"].includes(currency)) {
      throw new BadRequestException("Currency must be USD, UAH, or EUR");
    }

    if (!dto.confirmDuplicate) {
      await this.assertNoRecentDuplicateCash({
        amount,
        currency,
        paidAt,
        orderId: dto.orderId,
        clientId: order.clientId,
        contactId: dto.contactId ?? order.contactId,
      });
    }

    const allocations = dto.allocations?.length
      ? dto.allocations.map((a) => ({ orderId: a.orderId, amount: Number(a.amount) }))
      : [{ orderId: dto.orderId, amount }];

    const totalAlloc = allocations.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(totalAlloc - amount) > BANK_ALLOCATION_EPSILON) {
      throw new BadRequestException(
        `Total allocated ${totalAlloc} must equal payment amount ${amount}`,
      );
    }
    for (const a of allocations) {
      if (!Number.isFinite(a.amount) || a.amount <= 0) {
        throw new BadRequestException("Each allocation amount must be positive");
      }
    }

    const anchorClientId = order.clientId;
    const anchorContactId = order.contactId;
    const orderIds = new Set<string>();
    for (const a of allocations) {
      const target = await this.prisma.order.findUnique({
        where: { id: a.orderId },
        select: { id: true, ownerId: true, clientId: true, contactId: true },
      });
      if (!target) throw new NotFoundException(`Order not found: ${a.orderId}`);
      if (actor?.role === UserRole.MANAGER && target.ownerId !== actor.id) {
        throw new ForbiddenException("You can only add payments to orders assigned to you");
      }
      const sameClient =
        (anchorClientId && target.clientId === anchorClientId) ||
        (anchorContactId && target.contactId === anchorContactId) ||
        (order.clientId && target.clientId === order.clientId) ||
        (order.contactId && target.contactId === order.contactId) ||
        a.orderId === dto.orderId;
      if (!sameClient) {
        throw new BadRequestException("All allocations must belong to the same client");
      }
      orderIds.add(a.orderId);
    }

    const rates = await this.settings.getExchangeRates();
    const createdOrderIds: string[] = [];

    try {
      for (const a of allocations) {
        const amountUsd = convertToUsd(a.amount, currency, rates);
        await this.prisma.payment.create({
          data: {
            orderId: a.orderId,
            contactId: dto.contactId ?? null,
            companyId: dto.companyId ?? null,
            sourceType: PaymentSourceType.CASH,
            amount: a.amount,
            currency,
            amountUsd,
            paidAt,
            status: PaymentStatus.COMPLETED,
            createdByUserId: actor?.id ?? null,
            note: dto.note ?? null,
          },
        });
        createdOrderIds.push(a.orderId);
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Duplicate cash payment");
      }
      throw err;
    }

    for (const oid of orderIds) {
      await this.recalcOrder(oid);
    }
    return this.listByOrderId(dto.orderId, actor);
  }

  private async assertNoRecentDuplicateCash(input: {
    amount: number;
    currency: string;
    paidAt: Date;
    orderId: string;
    clientId: string | null;
    contactId: string | null;
  }): Promise<void> {
    const window = cashPaymentConfirmDedupWindow(input.paidAt);
    const baseWhere: Prisma.PaymentWhereInput = {
      amount: input.amount,
      currency: input.currency,
      status: PaymentStatus.COMPLETED,
      bankTransactionId: null,
      sourceType: PaymentSourceType.CASH,
      paidAt: window,
    };
    const orFilters: Prisma.PaymentWhereInput[] = [{ orderId: input.orderId }];
    if (input.clientId) {
      orFilters.push({ order: { clientId: input.clientId } });
    }
    if (input.contactId) {
      orFilters.push({ contactId: input.contactId });
    }
    const duplicate = await this.prisma.payment.findFirst({
      where: { AND: [baseWhere, { OR: orFilters }] },
      include: {
        order: { select: { orderNumber: true } },
        createdBy: { select: { fullName: true } },
      },
    });
    if (!duplicate) return;
    throw new ConflictException({
      message: "A cash payment with the same amount was recorded recently for this client or order",
      code: "CASH_PAYMENT_DUPLICATE",
      existing: {
        id: duplicate.id,
        orderId: duplicate.orderId,
        orderNumber: duplicate.order?.orderNumber ?? null,
        amount: Number(duplicate.amount),
        currency: duplicate.currency,
        paidAt: duplicate.paidAt.toISOString(),
        createdByName: duplicate.createdBy?.fullName ?? null,
      },
    });
  }

  async update(id: string, dto: UpdatePaymentDto, actor?: AuthUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: { select: { id: true, ownerId: true, orderNumber: true } } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (actor?.role === UserRole.MANAGER && payment.order?.ownerId !== actor.id) {
      throw new ForbiddenException("You can only edit payments for orders assigned to you");
    }
    const data: {
      amount?: number;
      currency?: string;
      amountUsd?: number;
      paidAt?: Date;
      note?: string | null;
      orderId?: string;
    } = {};
    if (dto.note !== undefined) data.note = dto.note || null;
    if (dto.amountUsd !== undefined) {
      if (actor?.role !== UserRole.ADMIN) {
        throw new ForbiddenException("Only ADMIN can change fixed USD amount");
      }
      const amountUsd = Number(dto.amountUsd);
      if (!Number.isFinite(amountUsd) || amountUsd < 0)
        throw new BadRequestException("Amount USD must be a non-negative number");
      data.amountUsd = amountUsd;
    }
    if (payment.sourceType === PaymentSourceType.CASH) {
      const amountChanging = dto.amount != null;
      const currencyChanging = dto.currency != null;
      if (amountChanging || currencyChanging) {
        const amount = amountChanging ? Number(dto.amount) : Number(payment.amount);
        if (!Number.isFinite(amount) || amount <= 0)
          throw new BadRequestException("Amount must be a positive number");
        if (amountChanging) data.amount = amount;

        let currency = payment.currency;
        if (currencyChanging) {
          const next = String(dto.currency).trim().toUpperCase();
          if (!["USD", "UAH", "EUR"].includes(next)) {
            throw new BadRequestException("Currency must be USD, UAH, or EUR");
          }
          currency = next;
          data.currency = next;
        }

        // Keep USD equivalent in sync unless ADMIN explicitly overrides amountUsd.
        if (dto.amountUsd === undefined) {
          const rates = await this.settings.getExchangeRates();
          data.amountUsd = convertToUsd(amount, currency, rates);
        }
      }
      if (dto.paidAt != null) {
        const paidAt = new Date(dto.paidAt);
        if (Number.isNaN(paidAt.getTime())) throw new BadRequestException("Invalid paidAt date");
        data.paidAt = paidAt;
      }
    } else if (dto.amount != null || dto.currency != null) {
      throw new BadRequestException("Only cash payments can change amount or currency");
    }
    if (dto.orderId != null && dto.orderId !== payment.orderId) {
      const newOrder = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { id: true, ownerId: true },
      });
      if (!newOrder) throw new NotFoundException("Order not found");
      if (actor?.role === UserRole.MANAGER && newOrder.ownerId !== actor.id) {
        throw new ForbiddenException("You can only assign payments to orders assigned to you");
      }
      data.orderId = dto.orderId;
    }
    if (Object.keys(data).length === 0) return this.listByOrderId(payment.orderId, actor);
    const oldOrderId = payment.orderId;
    const newOrderId = data.orderId ?? payment.orderId;
    const beforeAudit = paymentAuditSnapshot(payment, payment.order?.orderNumber);
    await this.prisma.payment.update({
      where: { id },
      data,
    });
    const afterPayment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: { select: { orderNumber: true } } },
    });
    if (actor && afterPayment) {
      await writePaymentChangeAudit(this.audit, {
        action: "UPDATE",
        changedBy: actor.id,
        changedByRole: actor.role,
        before: beforeAudit,
        after: paymentAuditSnapshot(afterPayment, afterPayment.order?.orderNumber),
      });
    }
    await this.recalcOrder(oldOrderId);
    if (newOrderId !== oldOrderId) await this.recalcOrder(newOrderId);
    return this.listByOrderId(newOrderId, actor);
  }

  async deleteCashPayment(id: string, actor?: AuthUser) {
    if (!actor || actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only ADMIN can delete cash payments");
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: { select: { id: true, orderNumber: true } } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.sourceType !== PaymentSourceType.CASH) {
      throw new BadRequestException("Only cash payments can be deleted");
    }
    const orderId = payment.orderId;
    const beforeAudit = paymentAuditSnapshot(payment, payment.order?.orderNumber);
    await this.prisma.payment.delete({ where: { id } });
    await writePaymentChangeAudit(this.audit, {
      action: "DELETE",
      changedBy: actor.id,
      changedByRole: actor.role,
      before: beforeAudit,
      after: null,
    });
    await this.recalcOrder(orderId);
    return { ok: true as const, orderId };
  }

  async splitPayment(id: string, dto: SplitPaymentDto, actor?: AuthUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: { select: { id: true, ownerId: true } } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.sourceType !== PaymentSourceType.BANK || !payment.bankTransactionId) {
      throw new BadRequestException("Only bank payments can be split");
    }
    if (actor?.role === UserRole.MANAGER && payment.order?.ownerId !== actor.id) {
      throw new ForbiddenException("You can only split payments for orders assigned to you");
    }
    if (!dto.allocations?.length) {
      throw new BadRequestException("At least one allocation required");
    }
    const totalAmount = Number(payment.amount);
    const totalAlloc = dto.allocations.reduce((s, a) => s + Number(a.amount), 0);
    if (Math.abs(totalAlloc - totalAmount) > 0.01) {
      throw new BadRequestException(
        `Total allocated ${totalAlloc} must equal payment amount ${totalAmount}`,
      );
    }
    const paymentAmountUsd = payment.amountUsd != null ? Number(payment.amountUsd) : null;
    const currency = payment.currency || "USD";
    const paidAt = payment.paidAt;

    for (const a of dto.allocations) {
      const amount = Number(a.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException("Each allocation amount must be positive");
      }
      const order = await this.prisma.order.findUnique({ where: { id: a.orderId } });
      if (!order) throw new NotFoundException(`Order not found: ${a.orderId}`);
      if (actor?.role === UserRole.MANAGER && order.ownerId !== actor.id) {
        throw new ForbiddenException("You can only assign to orders assigned to you");
      }
    }

    const orderIds = new Set<string>([payment.orderId, ...dto.allocations.map((a) => a.orderId)]);

    await this.prisma.$transaction(async (db) => {
      await lockBankTransactionForUpdate(db, payment.bankTransactionId!);
      const lockedPayment = await db.payment.findUnique({ where: { id } });
      if (!lockedPayment) throw new NotFoundException("Payment not found");

      const siblings = await db.payment.findMany({
        where: { bankTransactionId: payment.bankTransactionId! },
      });
      const bankTx = await db.bankTransaction.findUnique({
        where: { id: payment.bankTransactionId! },
      });
      if (!bankTx) throw new NotFoundException("Transaction not found");

      const otherAllocated = sumBankTransactionAllocations(
        siblings.filter((s) => s.id !== id),
      );
      if (allocationExceedsTransaction(otherAllocated, totalAlloc, Number(bankTx.amount))) {
        throw new BadRequestException("Transaction amount would be exceeded");
      }

      await db.payment.delete({ where: { id } });

      for (const a of dto.allocations) {
        const amount = Number(a.amount);
        const amountUsd =
          paymentAmountUsd != null && totalAmount > 0
            ? (amount / totalAmount) * paymentAmountUsd
            : undefined;
        await db.payment.create({
          data: {
            orderId: a.orderId,
            sourceType: PaymentSourceType.BANK,
            amount,
            currency,
            amountUsd: amountUsd != null ? amountUsd : undefined,
            paidAt,
            status: PaymentStatus.COMPLETED,
            bankTransactionId: payment.bankTransactionId,
            createdByUserId: actor?.id ?? null,
          },
        });
      }
    });

    for (const oid of orderIds) {
      await this.recalcOrder(oid);
    }

    return this.list({ page: 1, pageSize: 50, offset: 0, limit: 50 }, actor);
  }

  async unallocateBankPayment(id: string, actor?: AuthUser) {
    if (
      !actor ||
      (actor.role !== UserRole.ADMIN &&
        actor.role !== UserRole.LEAD &&
        actor.role !== UserRole.MANAGER)
    ) {
      throw new ForbiddenException("You are not allowed to unallocate bank payments");
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        sourceType: true,
        bankTransactionId: true,
        order: { select: { ownerId: true } },
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.sourceType !== PaymentSourceType.BANK || !payment.bankTransactionId) {
      throw new BadRequestException("Only allocated bank payments can be unallocated");
    }
    const siblings = await this.prisma.payment.findMany({
      where: { bankTransactionId: payment.bankTransactionId },
      select: {
        id: true,
        orderId: true,
        order: { select: { ownerId: true } },
      },
    });
    if (actor.role === UserRole.MANAGER) {
      for (const s of siblings) {
        if (s.order?.ownerId !== actor.id) {
          throw new ForbiddenException("You can only unallocate payments for orders assigned to you");
        }
      }
    }
    const orderIds = [...new Set(siblings.map((s) => s.orderId))];
    const bankTransactionId = payment.bankTransactionId;
    await this.prisma.payment.deleteMany({
      where: { bankTransactionId },
    });
    for (const oid of orderIds) {
      await this.recalcOrder(oid);
    }
    await this.syncBankTransactionMatchStatus(bankTransactionId);
    return { ok: true };
  }

  async transferCredit(dto: TransferCreditDto, actor?: AuthUser) {
    if (
      !actor ||
      (actor.role !== UserRole.ADMIN &&
        actor.role !== UserRole.LEAD &&
        actor.role !== UserRole.MANAGER)
    ) {
      throw new ForbiddenException("You are not allowed to transfer credit");
    }

    const amount = roundMoney(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Amount must be a positive number");
    }
    if (dto.fromOrderId === dto.toOrderId) {
      throw new BadRequestException("Cannot transfer credit to the same order");
    }

    const [fromOrder, toOrder] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: dto.fromOrderId },
        select: {
          id: true,
          ownerId: true,
          clientId: true,
          contactId: true,
          companyId: true,
          currency: true,
          orderNumber: true,
          creditAmount: true,
          debtAmount: true,
        },
      }),
      this.prisma.order.findUnique({
        where: { id: dto.toOrderId },
        select: {
          id: true,
          ownerId: true,
          clientId: true,
          contactId: true,
          companyId: true,
          currency: true,
          orderNumber: true,
          creditAmount: true,
          debtAmount: true,
        },
      }),
    ]);

    if (!fromOrder) throw new NotFoundException("Source order not found");
    if (!toOrder) throw new NotFoundException("Target order not found");

    if (actor.role === UserRole.MANAGER) {
      if (fromOrder.ownerId !== actor.id || toOrder.ownerId !== actor.id) {
        throw new ForbiddenException("You can only transfer credit between orders assigned to you");
      }
    }

    if (!fromOrder.clientId || fromOrder.clientId !== toOrder.clientId) {
      throw new BadRequestException("Both orders must belong to the same client");
    }

    const fromCur = (fromOrder.currency || "USD").toUpperCase();
    const toCur = (toOrder.currency || "USD").toUpperCase();
    if (fromCur !== toCur) {
      throw new BadRequestException("Orders must use the same currency for credit transfer");
    }

    const availableCredit = roundMoney(Number(fromOrder.creditAmount ?? 0));
    const targetDebt = roundMoney(Number(toOrder.debtAmount ?? 0));
    if (amount > availableCredit + 0.009) {
      throw new BadRequestException(`Amount exceeds available credit (${availableCredit})`);
    }
    if (amount > targetDebt + 0.009) {
      throw new BadRequestException(`Amount exceeds target order debt (${targetDebt})`);
    }

    const rates = await this.settings.getExchangeRates();
    const amountUsd = convertToUsd(amount, fromCur, rates);
    const transferGroupId = randomUUID();
    const paidAt = new Date();
    const noteBase =
      dto.note?.trim() ||
      `Перенос переплати ${amount.toFixed(2)} ${fromCur}: ${fromOrder.orderNumber ?? fromOrder.id} → ${toOrder.orderNumber ?? toOrder.id}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId: fromOrder.id,
          contactId: fromOrder.clientId ?? fromOrder.contactId,
          companyId: fromOrder.companyId,
          sourceType: PaymentSourceType.CREDIT_TRANSFER,
          amount: -amount,
          currency: fromCur,
          amountUsd: -amountUsd,
          paidAt,
          status: PaymentStatus.COMPLETED,
          createdByUserId: actor.id,
          note: noteBase,
          transferGroupId,
          linkedOrderId: toOrder.id,
        },
      });
      await tx.payment.create({
        data: {
          orderId: toOrder.id,
          contactId: toOrder.clientId ?? toOrder.contactId,
          companyId: toOrder.companyId,
          sourceType: PaymentSourceType.CREDIT_TRANSFER,
          amount,
          currency: toCur,
          amountUsd,
          paidAt,
          status: PaymentStatus.COMPLETED,
          createdByUserId: actor.id,
          note: noteBase,
          transferGroupId,
          linkedOrderId: fromOrder.id,
        },
      });
    });

    await this.recalcOrder(fromOrder.id);
    await this.recalcOrder(toOrder.id);

    const [fromAfter, toAfter] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: fromOrder.id },
        select: {
          id: true,
          orderNumber: true,
          paidAmount: true,
          debtAmount: true,
          creditAmount: true,
        },
      }),
      this.prisma.order.findUnique({
        where: { id: toOrder.id },
        select: {
          id: true,
          orderNumber: true,
          paidAmount: true,
          debtAmount: true,
          creditAmount: true,
        },
      }),
    ]);

    return {
      transferGroupId,
      amount,
      currency: fromCur,
      fromOrder: fromAfter,
      toOrder: toAfter,
    };
  }

  async recalcOrder(orderId: string): Promise<void> {
    await recalcOrderFinance(this.prisma, this.settings, orderId);
  }
}
