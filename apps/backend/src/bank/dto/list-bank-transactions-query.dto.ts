export type ListBankTransactionsQueryDto = {
  unmatched?: boolean;
  bankAccountId?: string;
  from?: string; // ISO date for bookedAt >= from
  to?: string;   // ISO date for bookedAt <= to
  page?: number;
  pageSize?: number;
};
