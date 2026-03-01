export type AllocateSplitItemDto = {
  orderId: string;
  amount: number;
};

export type AllocateSplitDto = {
  transactionId: string;
  allocations: AllocateSplitItemDto[];
};
