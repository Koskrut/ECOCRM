import { Injectable, Logger } from "@nestjs/common";
import {
  BankIgnoreCategory,
  BankIgnoreSource,
  BankTransactionMatchStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  classifyBankTransaction,
  type ClassifierInput,
  type OwnAccountHint,
} from "./bank-transaction-classifier";

@Injectable()
export class BankTransactionClassifierService {
  private readonly logger = new Logger(BankTransactionClassifierService.name);
  private ownAccountsCache: { at: number; accounts: OwnAccountHint[] } | null = null;
  private static readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getOwnAccountHints(): Promise<OwnAccountHint[]> {
    const now = Date.now();
    if (this.ownAccountsCache && now - this.ownAccountsCache.at < BankTransactionClassifierService.CACHE_TTL_MS) {
      return this.ownAccountsCache.accounts;
    }
    const accounts = await this.prisma.bankAccount.findMany({
      select: { iban: true, name: true, documentRequisites: true },
    });
    const hints: OwnAccountHint[] = accounts.map((a) => {
      const req = (a.documentRequisites ?? null) as { legalName?: string } | null;
      return {
        iban: a.iban,
        name: a.name,
        legalName: typeof req?.legalName === "string" ? req.legalName : null,
      };
    });
    this.ownAccountsCache = { at: now, accounts: hints };
    return hints;
  }

  classify(input: ClassifierInput, ownAccounts?: OwnAccountHint[]) {
    return classifyBankTransaction(input, ownAccounts ?? []);
  }

  /**
   * Classify a single upserted transaction immediately after create.
   * Only applies when still UNMATCHED and without COMPLETED payments.
   */
  async applyToTransactionId(transactionId: string): Promise<boolean> {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        matchStatus: true,
        description: true,
        counterpartyName: true,
        counterpartyIban: true,
        payments: { where: { status: "COMPLETED" }, select: { id: true }, take: 1 },
      },
    });
    if (!tx) return false;
    if (tx.matchStatus !== BankTransactionMatchStatus.UNMATCHED) return false;
    if (tx.payments.length > 0) return false;

    const own = await this.getOwnAccountHints();
    const result = this.classify(tx, own);
    if (!result) return false;

    await this.prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        matchStatus: BankTransactionMatchStatus.TECHNICAL,
        ignoreCategory: result.category,
        ignoreSource: BankIgnoreSource.AUTO,
        ignoredAt: new Date(),
        ignoredByUserId: null,
        matchScore: null,
        suggestedOrderId: null,
      },
    });
    return true;
  }

  /**
   * Backfill: mark existing UNMATCHED (no COMPLETED payments) as TECHNICAL when rules match.
   */
  async classifyExistingUnmatched(limit = 5000): Promise<number> {
    const own = await this.getOwnAccountHints();
    const candidates = await this.prisma.bankTransaction.findMany({
      where: {
        matchStatus: {
          in: [BankTransactionMatchStatus.UNMATCHED, BankTransactionMatchStatus.NEEDS_REVIEW],
        },
        payments: { none: { status: "COMPLETED" } },
      },
      select: {
        id: true,
        description: true,
        counterpartyName: true,
        counterpartyIban: true,
      },
      take: limit,
      orderBy: { bookedAt: "desc" },
    });

    let marked = 0;
    for (const tx of candidates) {
      const result = this.classify(tx, own);
      if (!result) continue;
      await this.prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          matchStatus: BankTransactionMatchStatus.TECHNICAL,
          ignoreCategory: result.category,
          ignoreSource: BankIgnoreSource.AUTO,
          ignoredAt: new Date(),
          ignoredByUserId: null,
          matchScore: null,
          suggestedOrderId: null,
        },
      });
      marked++;
    }
    if (marked > 0) {
      this.logger.log(`Auto-classified ${marked} bank transactions as TECHNICAL`);
    }
    return marked;
  }

  technicalCreateFields(
    input: ClassifierInput,
    ownAccounts: OwnAccountHint[],
  ): {
    matchStatus: BankTransactionMatchStatus;
    ignoreCategory?: BankIgnoreCategory;
    ignoreSource?: BankIgnoreSource;
    ignoredAt?: Date;
  } {
    const result = this.classify(input, ownAccounts);
    if (!result) {
      return { matchStatus: BankTransactionMatchStatus.UNMATCHED };
    }
    return {
      matchStatus: BankTransactionMatchStatus.TECHNICAL,
      ignoreCategory: result.category,
      ignoreSource: BankIgnoreSource.AUTO,
      ignoredAt: new Date(),
    };
  }
}
