import { Injectable, Logger } from "@nestjs/common";
import { TransactionDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RawBankTransaction } from "./providers/types";
import { Privat24Provider } from "./providers/privat24.provider";
import { MatchEngineService } from "./match-engine.service";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name);
  private readonly privat24 = new Privat24Provider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchEngine: MatchEngineService,
  ) {}

  async syncAll(): Promise<{ accounts: number; transactions: number }> {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { provider: "PRIVAT24", isActive: true },
    });
    let totalTransactions = 0;

    for (const acc of accounts) {
      try {
        const count = await this.syncAccount(acc.id);
        totalTransactions += count;
      } catch (e) {
        this.logger.warn(`Sync failed for account ${acc.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await this.matchEngine.run();
    return { accounts: accounts.length, transactions: totalTransactions };
  }

  async syncAccount(bankAccountId: string): Promise<number> {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    });
    if (!account || account.provider !== "PRIVAT24") return 0;

    const to = new Date();
    const from = new Date(
      account.lastSyncAt ? Math.min(account.lastSyncAt.getTime() - TWO_DAYS_MS, Date.now()) : to.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    const { transactions, nextCursor } = await this.privat24.fetchStatement(
      account.id,
      account.credentials,
      from,
      to,
      account.syncCursor ?? undefined,
    );

    let upserted = 0;
    for (const tx of transactions) {
      await this.upsertTransaction(bankAccountId, tx);
      upserted++;
    }

    await this.prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: { lastSyncAt: to, syncCursor: nextCursor ?? null },
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
    await this.prisma.bankTransaction.upsert({
      where: {
        bankAccountId_externalId: { bankAccountId, externalId: tx.externalId },
      },
      create: {
        bankAccountId,
        externalId: tx.externalId,
        bookedAt: tx.bookedAt,
        amount: tx.amount,
        currency: tx.currency,
        direction: tx.direction as TransactionDirection,
        description: tx.description ?? null,
        counterpartyName: tx.counterpartyName ?? null,
        counterpartyIban: tx.counterpartyIban ?? null,
        rawPayload: tx.rawPayload ? (tx.rawPayload as object) : undefined,
      },
      update: {},
    });
  }
}
