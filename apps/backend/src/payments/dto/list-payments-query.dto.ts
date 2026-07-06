export type ListPaymentsQueryDto = {
  bankAccountId?: string;
  /** Search by order number, contact name/phone, bank description. */
  q?: string;
  sourceType?: "CASH" | "BANK";
  page?: number;
  pageSize?: number;
};
