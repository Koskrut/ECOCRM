export type AllocateMatchMetaDto = {
  decision?: "AUTO" | "SUGGESTED" | "MANUAL";
  matchReason?: string | null;
  reasons?: unknown;
  score?: number | null;
  confirmSuggestionId?: string;
};

export type AllocatePaymentDto = {
  transactionId: string;
  orderId: string;
  amount?: number;
  /** Optional audit / suggestion confirmation metadata (backward compatible). */
  matchMeta?: AllocateMatchMetaDto;
  confirmSuggestionId?: string;
};
