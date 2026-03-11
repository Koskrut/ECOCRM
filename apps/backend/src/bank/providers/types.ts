import type { TransactionDirection } from "@prisma/client";

export type RawBankTransaction = {
  /** API id when stable; if missing, hash is used for dedupKey */
  externalId?: string;
  /** Hash for dedup when externalId not provided; set by importer */
  hash?: string;
  bookedAt: Date;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  description?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  rawPayload?: Record<string, unknown>;
};

export type BankStatementProvider = {
  fetchStatement(
    accountId: string,
    credentials: unknown,
    iban: string | null,
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<{ transactions: RawBankTransaction[]; nextCursor?: string }>;
};
