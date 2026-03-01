import type { TransactionDirection } from "@prisma/client";

export type RawBankTransaction = {
  externalId: string;
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
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<{ transactions: RawBankTransaction[]; nextCursor?: string }>;
};
