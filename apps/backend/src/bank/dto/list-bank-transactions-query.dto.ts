export type ListBankTransactionsQueryDto = {
  unmatched?: boolean | string;
  /** List TECHNICAL/IGNORED (non-client) for audit. */
  ignored?: boolean | string;
  bankAccountId?: string;
  /** Search by description, counterparty, order number (digits). */
  q?: string;
  /** Include match suggestions for unmatched transactions. */
  suggest?: boolean | string;
  from?: string; // ISO date for bookedAt >= from
  to?: string;   // ISO date for bookedAt <= to
  page?: number;
  pageSize?: number;
};

export type IgnoreBankTransactionDto = {
  category: string;
};
