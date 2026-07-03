export type ListBankTransactionsQueryDto = {
  unmatched?: boolean;
  bankAccountId?: string;
  /** Search by description, counterparty, order number (digits). */
  q?: string;
  /** Include match suggestions for unmatched transactions. */
  suggest?: boolean;
  from?: string; // ISO date for bookedAt >= from
  to?: string;   // ISO date for bookedAt <= to
  page?: number;
  pageSize?: number;
};
