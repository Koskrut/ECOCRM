export type UpdatePaymentDto = {
  amount?: number;
  /** Currency code for cash payments (e.g. UAH, USD, EUR). */
  currency?: string;
  /** Fixed USD amount (only ADMIN can set). */
  amountUsd?: number;
  paidAt?: string;
  note?: string;
  /** Move payment to another order (recalculates both orders). */
  orderId?: string;
};
