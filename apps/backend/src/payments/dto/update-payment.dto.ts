export type UpdatePaymentDto = {
  amount?: number;
  /** Fixed USD amount (only ADMIN can set). */
  amountUsd?: number;
  paidAt?: string;
  note?: string;
  /** Move payment to another order (recalculates both orders). */
  orderId?: string;
};
