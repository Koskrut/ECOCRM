export type MatchReasonCode =
  | "iban_history"
  | "orders_in_purpose"
  | "invoice_match"
  | "waybill_match"
  | "name_match"
  | "payer_name_in_purpose"
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
  /** 1C invoice number when matched from purpose. */
  matchedInvoiceNumber?: string | null;
  /** 1C waybill (РН) number when matched from purpose. */
  matchedWaybillNumber?: string | null;
};

export type ParsedDocumentsResult = {
  invoices: string[];
  waybills: string[];
  unlabeled: string[];
  matchedInvoiceNumber?: string | null;
  matchedWaybillNumber?: string | null;
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
  parsedDocuments?: ParsedDocumentsResult;
  documentMatchOrderId?: string | null;
  autoMatchEligible: boolean;
  autoMatchPlan?: AutoMatchPlan;
  allocatedAmount: number;
  remainingAmount: number;
};
