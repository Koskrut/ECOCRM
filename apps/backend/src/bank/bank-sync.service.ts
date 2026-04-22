import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma, TransactionDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RawBankTransaction } from "./providers/types";
import { Privat24Provider } from "./providers/privat24.provider";
import { MatchEngineService } from "./match-engine.service";

const DEBUG_LOG_PATH = "/Users/konstantin/CRM/.cursor/debug-f04031.log";
function debugLog(msg: string, data: Record<string, unknown> = {}) {
  try {
    appendFileSync(
      DEBUG_LOG_PATH,
      JSON.stringify({ timestamp: Date.now(), location: "bank-sync.service", message: msg, data }) + "\n",
    );
  } catch (_) {}
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function computeTxHash(tx: RawBankTransaction): string {
  const payload = [
    tx.bookedAt instanceof Date ? tx.bookedAt.toISOString() : String(tx.bookedAt),
    tx.amount,
    tx.currency,
    tx.direction,
    tx.description ?? "",
    tx.counterpartyName ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Privat24 can return the same operation with different external IDs.
 * REF+REFN is stable enough for idempotent import across repeated sync windows.
 */
function extractPrivat24StableDedupKey(tx: RawBankTransaction): string | null {
  const payload = tx.rawPayload;
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;

  const ref = toTrimmedString(row.REF ?? row.ref);
  const refn = toTrimmedString(row.REFN ?? row.refn);
  if (ref && refn) return `p24-ref:${ref}+${refn}`;

  const technicalId = toTrimmedString(
    row.TECHNICAL_TRANSACTION_ID ?? row.technicalTransactionId ?? row.technical_transaction_id,
  );
  if (technicalId) return `p24-tech:${technicalId}`;

  return null;
}

function fingerprint(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name);
  private readonly privat24 = new Privat24Provider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchEngine: MatchEngineService,
  ) {}

  async syncAll(
    bankAccountId?: string,
    dateFromStr?: string,
    dateToStr?: string,
    /** When set (e.g. LEAD/MANAGER), only these account IDs may be synced. */
    restrictToAccountIds?: string[],
  ): Promise<{
    accounts: number;
    transactionsImported: number;
    matched: number;
    errors?: { bankAccountId: string; message: string }[];
  }> {
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    if (dateFromStr && dateToStr) {
      const fromParsed = new Date(dateFromStr.includes("T") ? dateFromStr : `${dateFromStr}T00:00:00.000Z`);
      const toParsed = new Date(dateToStr.includes("T") ? dateToStr : `${dateToStr}T23:59:59.999Z`);
      if (!Number.isNaN(fromParsed.getTime()) && !Number.isNaN(toParsed.getTime())) {
        dateFrom = fromParsed;
        dateTo = toParsed;
      }
    }

    const baseWhere: Prisma.BankAccountWhereInput = {
      provider: "PRIVAT24",
      isActive: true,
    };
    if (bankAccountId) {
      baseWhere.id = bankAccountId;
    } else if (restrictToAccountIds !== undefined) {
      baseWhere.id =
        restrictToAccountIds.length > 0 ? { in: restrictToAccountIds } : { in: [] };
    }
    const accounts = await this.prisma.bankAccount.findMany({
      where: baseWhere,
    });
    if (bankAccountId && accounts.length === 0) {
      debugLog("syncAll invalid bankAccountId filter", { bankAccountId });
      return {
        accounts: 0,
        transactionsImported: 0,
        matched: 0,
        errors: [
          {
            bankAccountId,
            message: "Выбранный счет не найден среди активных счетов PRIVAT24.",
          },
        ],
      };
    }
    // Выписка только по счёту с указанным IBAN — счета без IBAN не синкаем
    const accountsWithIban = accounts.filter((a) => a.iban && a.iban.trim());
    if (bankAccountId && accounts.length > 0 && accountsWithIban.length === 0) {
      debugLog("syncAll selected account without IBAN", { bankAccountId });
      return {
        accounts: 0,
        transactionsImported: 0,
        matched: 0,
        errors: [
          {
            bankAccountId,
            message: "Для выбранного счета не заполнен IBAN. Синхронизация невозможна.",
          },
        ],
      };
    }
    let transactionsImported = 0;
    const errors: { bankAccountId: string; message: string }[] = [];

    const range = dateFrom && dateTo ? { dateFrom, dateTo } : undefined;
    debugLog("syncAll start", {
      bankAccountIdFilter: bankAccountId ?? null,
      accountsFound: accountsWithIban.length,
      dateFrom: dateFrom?.toISOString() ?? null,
      dateTo: dateTo?.toISOString() ?? null,
    });

    for (const acc of accountsWithIban) {
      try {
        const count = await this.syncAccount(acc.id, range);
        transactionsImported += count;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debugLog("syncAll account error", { bankAccountId: acc.id, message: msg });
        this.logger.warn(`Sync failed for account ${acc.id}: ${msg}`);
        errors.push({ bankAccountId: acc.id, message: msg });
      }
    }

    const { matched } = await this.matchEngine.run();
    return {
      accounts: accountsWithIban.length,
      transactionsImported,
      matched,
      ...(errors.length > 0 && { errors }),
    };
  }

  async getSyncStatus(restrictToAccountIds?: string[]): Promise<{
    accounts: { id: string; name: string; lastSyncAt: Date | null; lastBookedAt: Date | null }[];
  }> {
    const where: Prisma.BankAccountWhereInput = { provider: "PRIVAT24", isActive: true };
    if (restrictToAccountIds !== undefined) {
      if (restrictToAccountIds.length === 0) {
        return { accounts: [] };
      }
      where.id = { in: restrictToAccountIds };
    }
    const accounts = await this.prisma.bankAccount.findMany({
      where,
      select: { id: true, name: true, lastSyncAt: true, lastBookedAt: true },
    });
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        lastSyncAt: a.lastSyncAt,
        lastBookedAt: a.lastBookedAt,
      })),
    };
  }

  async syncAccount(
    bankAccountId: string,
    range?: { dateFrom: Date; dateTo: Date },
  ): Promise<number> {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    });
    if (!account || account.provider !== "PRIVAT24") return 0;

    if (!account.iban || !account.iban.trim()) {
      debugLog("syncAccount skip no IBAN", { bankAccountId });
      return 0;
    }

    const creds = account.credentials as Record<string, unknown> | null;
    const hasToken = !!creds?.token;
    const hasId = !!(creds?.id ?? creds?.clientId);
    debugLog("syncAccount start", {
      bankAccountId,
      hasToken,
      hasId,
      credentialsKeys: creds ? Object.keys(creds) : [],
      tokenFp: fingerprint(creds?.token),
      appIdFp: fingerprint(creds?.clientId),
      groupIdFp: fingerprint(creds?.id),
      appIdLen: typeof creds?.clientId === "string" ? creds.clientId.length : 0,
      groupIdLen: typeof creds?.id === "string" ? creds.id.length : 0,
      ibanLength: account.iban?.length ?? 0,
      range: range ? `${range.dateFrom.toISOString()} — ${range.dateTo.toISOString()}` : null,
    });

    let from: Date;
    let to: Date;
    if (range) {
      from = range.dateFrom;
      to = range.dateTo;
      this.logger.log(`Sync ${bankAccountId} for range ${from.toISOString()} — ${to.toISOString()}`);
    } else {
      to = new Date();
      const windowDays = account.syncWindowDays ?? 2;
      const defaultFrom = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      const base = account.lastBookedAt ?? defaultFrom;
      from = new Date(base.getTime() - windowDays * 24 * 60 * 60 * 1000);
    }

    const { transactions, nextCursor } = await this.privat24.fetchStatement(
      account.id,
      account.credentials,
      account.iban,
      from,
      to,
      account.syncCursor ?? undefined,
    );

    debugLog("syncAccount fetchStatement result", {
      bankAccountId,
      transactionsCount: transactions.length,
      nextCursor: nextCursor ?? null,
    });

    let upserted = 0;
    let maxBookedAt: Date | null = null;
    for (const tx of transactions) {
      await this.upsertTransaction(bankAccountId, tx);
      upserted++;
      if (tx.bookedAt && (!maxBookedAt || tx.bookedAt > maxBookedAt)) {
        maxBookedAt = tx.bookedAt instanceof Date ? tx.bookedAt : new Date(tx.bookedAt);
      }
    }

    await this.prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        lastSyncAt: to,
        syncCursor: nextCursor ?? null,
        ...(maxBookedAt && { lastBookedAt: maxBookedAt }),
      },
    });
    return upserted;
  }

  async importTransactions(bankAccountId: string, transactions: RawBankTransaction[]): Promise<number> {
    let count = 0;
    for (const tx of transactions) {
      await this.upsertTransaction(bankAccountId, tx);
      count++;
    }
    await this.matchEngine.run();
    return count;
  }

  private async upsertTransaction(bankAccountId: string, tx: RawBankTransaction) {
    const stableProviderKey = extractPrivat24StableDedupKey(tx);
    const dedupKey = stableProviderKey ?? tx.externalId ?? tx.hash ?? computeTxHash(tx);
    const hash = tx.hash ?? computeTxHash(tx);
    await this.prisma.bankTransaction.upsert({
      where: {
        bankAccountId_dedupKey: { bankAccountId, dedupKey },
      },
      create: {
        bankAccountId,
        dedupKey,
        externalId: tx.externalId ?? null,
        hash,
        bookedAt: tx.bookedAt,
        amount: tx.amount,
        currency: tx.currency,
        direction: tx.direction as TransactionDirection,
        description: tx.description ?? null,
        counterpartyName: tx.counterpartyName ?? null,
        counterpartyIban: tx.counterpartyIban ?? null,
        rawPayload: tx.rawPayload ? (tx.rawPayload as object) : undefined,
      },
      update: {
        externalId: tx.externalId ?? undefined,
        hash,
        rawPayload: tx.rawPayload ? (tx.rawPayload as object) : undefined,
      },
    });
  }
}
