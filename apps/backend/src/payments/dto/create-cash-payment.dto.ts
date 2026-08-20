export type CreateCashAllocationDto = {
  orderId: string;
  amount: number;
};

export type CreateCashPaymentDto = {
  orderId: string;
  amount: number;
  paidAt: string;
  /** Currency code (e.g. UAH, USD, EUR). Defaults to order currency if not set. */
  currency?: string;
  contactId?: string;
  companyId?: string;
  note?: string;
  /** Split payment across multiple orders of the same client. Sum must equal amount. */
  allocations?: CreateCashAllocationDto[];
  /** Set true after user confirms creating a duplicate cash payment. */
  confirmDuplicate?: boolean;
};
