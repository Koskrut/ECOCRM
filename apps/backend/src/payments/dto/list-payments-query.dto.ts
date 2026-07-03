export type ListPaymentsQueryDto = {
  bankAccountId?: string;
  /** Search by order number, contact name/phone, bank description. */
  q?: string;
  page?: number;
  pageSize?: number;
};
