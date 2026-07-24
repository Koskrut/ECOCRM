export type MatchReasonCode =
  | "iban_history"
  | "orders_in_purpose"
  | "name_match"
  | "edrpou"
  | "amount_fit";

export type MatchConfidence = "high" | "medium" | "low";

export type ProposedAllocationSource = "purpose_amount" | "debt" | "proportional";

export type OrderWithDebtSuggestion = {
  orderId: string;
  orderNumber: string;
  debtAmount: number;
  currency: string;
  suggestedAmount: number;
};

export type ProposedAllocation = {
  orderId: string;
  amount: number;
  source: ProposedAllocationSource;
};

export type ClientMatchSuggestion = {
  contactId?: string | null;
  companyId?: string | null;
  label: string;
  score: number;
  confidence: MatchConfidence;
  reasons: MatchReasonCode[];
  ordersWithDebt: OrderWithDebtSuggestion[];
  proposedAllocations?: ProposedAllocation[];
  warnings?: string[];
};

export type ParsedOrdersResult = {
  found: Array<{ orderId: string; orderNumber: string; explicitAmount?: number }>;
  notFound: string[];
  explicitAmounts?: Record<string, number>;
};

export type AutoMatchPlan = {
  allocations: ProposedAllocation[];
  reason: string;
};

export type TransactionMatchSuggestions = {
  transactionId: string;
  suggestions: ClientMatchSuggestion[];
  parsedOrders: ParsedOrdersResult;
  autoMatchEligible: boolean;
  autoMatchPlan?: AutoMatchPlan;
  allocatedAmount: number;
  remainingAmount: number;
};
