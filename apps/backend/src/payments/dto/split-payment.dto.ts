export type SplitPaymentItemDto = {
  orderId: string;
  amount: number;
};

export type SplitPaymentDto = {
  allocations: SplitPaymentItemDto[];
};
