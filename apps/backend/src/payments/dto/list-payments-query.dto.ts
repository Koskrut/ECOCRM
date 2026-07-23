export type ListPaymentsQueryDto = {
  bankAccountId?: string;
  /** Search by order number, contact name/phone, bank description, amount. */
  q?: string;
  sourceType?: "CASH" | "BANK";
  /** Filter paidAt >= dateFrom (ISO date or datetime). */
  dateFrom?: string;
  /** Filter paidAt <= dateTo (ISO date or datetime; date-only includes end of day). */
  dateTo?: string;
  page?: number;
  pageSize?: number;
};
