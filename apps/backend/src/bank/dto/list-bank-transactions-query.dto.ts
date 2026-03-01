export type ListBankTransactionsQueryDto = {
  unmatched?: boolean;
  bankAccountId?: string;
  page?: number;
  pageSize?: number;
};
