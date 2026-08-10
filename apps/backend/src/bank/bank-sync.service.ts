import { Injectable, Logger } from "@nestjs/common";
import { Prisma, TransactionDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BankProviderRegistry } from "./bank-provider.registry";
import { BankStatementSkipError } from "./providers/types";
import type { RawBankTransaction } from "./providers/types";
import { MatchEngineService } from "./match-engine.service";
import { BankTransactionClassifierService } from "./bank-transaction-classifier.service";
import { computeTxHash, resolveBankTransactionDedupKey } from "./bank-dedup.util";

const CURSOR_MAX_AGE_MS = 15 * 60 * 1000;

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchEngine: MatchEngineService,
    private readonly providerRegistry: BankProviderRegistry,
    private readonly classifier: BankTransactionClassifierService,
  ) {}

  async syncAll(
    bankAccountId?: string,
    dateFromStr?: string,
    dateToStr?: string,
    restrictToAccountIds?: string[],
  ): Promise<{
    accounts: number;
    transactionsImported: number;
    matched: number;
    technicalMarked?: number;
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

    const baseWhere: Prisma.BankAccountWhereInput = { isActive: true };
    if (bankAccountId) {
      baseWhere.id = bankAccountId;
    } else if (restrictToAccountIds !== undefined) {
      baseWhere.id = restrictToAccountIds.length > 0 ? { in: restrictToAccountIds } : { in: [] };
    }

    const accounts = await this.prisma.bankAccount.findMany({ where: baseWhere });
    const licensedProviders = new Set(await this.providerRegistry.listLicensedProviders());
    const syncable = accounts.filter(
      (a) => licensedProviders.has(a.provider) && this.providerRegistry.get(a.provider),
    );

    if (bankAccountId && accounts.length > 0 && syncable.length === 0) {
      const acc = accounts[0]!;
      return {
        accounts: 0,
        transactionsImported: 0,
        matched: 0,
        errors: [
          {
            bankAccountId,
            message: `Счёт не синхронизируется: провайдер ${acc.provider} не подключён или не лицензирован.`,
          },
        ],
      };
    }

    const accountsWithIban = syncable.filter((a) => a.iban && a.iban.trim());
    if (bankAccountId && syncable.length > 0 && accountsWithIban.length === 0) {
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

    for (const acc of accountsWithIban) {
      try {
        const count = await this.syncAccount(acc.id, range);
        transactionsImported += count;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Sync failed for account ${acc.id}: ${msg}`);
        errors.push({ bankAccountId: acc.id, message: msg });
      }
    }

    const technicalMarked = await this.classifier.classifyExistingUnmatched();
    const { matched } = await this.matchEngine.run();
    return {
      accounts: accountsWithIban.length,
      transactionsImported,
      matched,
      technicalMarked,
      ...(errors.length > 0 && { errors }),
    };
  }

  async getSyncStatus(restrictToAccountIds?: string[]): Promise<{
    accounts: { id: string; name: string; lastSyncAt: Date | null; lastBookedAt: Date | null }[];
  }> {
    const where: Prisma.BankAccountWhereInput = { isActive: true };
    if (restrictToAccountIds !== undefined) {
      if (restrictToAccountIds.length === 0) return { accounts: [] };
      where.id = { in: restrictToAccountIds };
    }
    const licensedProviders = await this.providerRegistry.listLicensedProviders();
    where.provider = { in: licensedProviders };

    const accounts = await this.prisma.bankAccount.findMany({
      where,
      select: { id: true, name: true, lastSyncAt: true, lastBookedAt: true },
    });
    return { accounts: accounts };
  }

  async syncAccount(
    bankAccountId: string,
    range?: { dateFrom: Date; dateTo: Date },
  ): Promise<number> {
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) return 0;

    const provider = this.providerRegistry.get(account.provider);
    if (!provider) {
      this.logger.debug(`No statement provider registered for ${account.provider}`);
      return 0;
    }
    if (!(await this.providerRegistry.isProviderLicensed(account.provider))) {
      this.logger.debug(`Provider ${account.provider} not licensed`);
      return 0;
    }
    if (!account.iban?.trim()) return 0;

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

    const isExplicitRange = !!range;
    const canReuseCursor =
      !isExplicitRange &&
      !!account.syncCursor &&
      !!account.lastSyncAt &&
      Date.now() - account.lastSyncAt.getTime() <= CURSOR_MAX_AGE_MS;
    const cursor = canReuseCursor ? (account.syncCursor ?? undefined) : undefined;

    let transactions: RawBankTransaction[] = [];
    let nextCursor: string | undefined;
    try {
      const result = await provider.fetchStatement(
        account.id,
        account.credentials,
        account.iban,
        from,
        to,
        cursor,
      );
      transactions = result.transactions;
      nextCursor = result.nextCursor;
    } catch (e) {
      if (e instanceof BankStatementSkipError) {
        this.logger.warn(`Sync skipped for account ${bankAccountId}: ${e.reason}`);
        await this.prisma.bankAccount.update({
          where: { id: bankAccountId },
          data: { lastSyncAt: new Date(), syncCursor: null },
        });
        return 0;
      }
      throw e;
    }

    let upserted = 0;
    let maxBookedAt: Date | null = null;
    for (const tx of transactions) {
      await this.upsertTransaction(bankAccountId, provider, tx);
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
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) return 0;
    const provider = this.providerRegistry.get(account.provider);

    let count = 0;
    for (const tx of transactions) {
      await this.upsertTransaction(bankAccountId, provider, tx);
      count++;
    }
    await this.classifier.classifyExistingUnmatched();
    await this.matchEngine.run();
    return count;
  }

  private async upsertTransaction(
    bankAccountId: string,
    provider: { resolveStableDedupKey?(tx: RawBankTransaction): string | null } | undefined,
    tx: RawBankTransaction,
  ) {
    const dedupKey = resolveBankTransactionDedupKey(provider, tx);
    const hash = tx.hash ?? computeTxHash(tx);
    const ownAccounts = await this.classifier.getOwnAccountHints();
    const classification = this.classifier.technicalCreateFields(
      {
        description: tx.description,
        counterpartyName: tx.counterpartyName,
        counterpartyIban: tx.counterpartyIban,
      },
      ownAccounts,
    );
    const updateFields = {
      externalId: tx.externalId ?? undefined,
      hash,
      dedupKey,
      rawPayload: tx.rawPayload ? (tx.rawPayload as object) : undefined,
    };

    if (tx.externalId) {
      const existing = await this.prisma.bankTransaction.findFirst({
        where: { bankAccountId, externalId: tx.externalId },
      });
      if (existing) {
        await this.prisma.bankTransaction.update({
          where: { id: existing.id },
          data: updateFields,
        });
        return;
      }
    }

    await this.prisma.bankTransaction.upsert({
      where: { bankAccountId_dedupKey: { bankAccountId, dedupKey } },
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
        matchStatus: classification.matchStatus,
        ignoreCategory: classification.ignoreCategory,
        ignoreSource: classification.ignoreSource,
        ignoredAt: classification.ignoredAt,
      },
      update: updateFields,
    });
  }
}
