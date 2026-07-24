import type { AllocateMatchMetaDto } from "./allocate-payment.dto";

export type AllocateSplitItemDto = {
  orderId: string;
  amount: number;
};

export type AllocateSplitDto = {
  transactionId: string;
  allocations: AllocateSplitItemDto[];
  /** Optional audit / suggestion confirmation metadata (backward compatible). */
  matchMeta?: AllocateMatchMetaDto;
  confirmSuggestionId?: string;
};
