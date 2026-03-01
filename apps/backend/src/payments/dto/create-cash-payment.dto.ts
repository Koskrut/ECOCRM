export type CreateCashPaymentDto = {
  orderId: string;
  amount: number;
  paidAt: string;
  /** Currency code (e.g. UAH, USD, EUR). Defaults to order currency if not set. */
  currency?: string;
  contactId?: string;
  companyId?: string;
  note?: string;
};
