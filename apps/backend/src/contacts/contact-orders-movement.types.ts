export type ContactOrderMovementCounts = {
  children: number;
  returns: number;
  payments: number;
  openReturns: number;
};

export type ContactOrderMovementChild = {
  id: string;
  orderNumber: string;
  orderStage: string | null;
  totalAmount: number;
  paymentStatus: string;
  currency: string;
  exchangeRate: number | null;
  counts: Pick<ContactOrderMovementCounts, "returns" | "payments" | "openReturns">;
};

export type ContactOrderReturnSummary = {
  id: string;
  status: string;
  requestedAt: string;
  creditAmount: number | null;
  refundAmount: number | null;
  replacementOrderId: string | null;
  replacementOrderNumber: string | null;
};

export type ContactOrderPaymentSummary = {
  id: string;
  amount: number;
  currency: string;
  sourceType: string;
  paidAt: string;
  status: string;
};

export type ContactOrderMovementNode = {
  id: string;
  orderNumber: string;
  status: string | null;
  orderStage: string | null;
  financialStatus: string | null;
  paymentStatus: string;
  totalAmount: number;
  returnAdjustmentAmount: number;
  paidAmount: number;
  debtAmount: number;
  creditAmount: number;
  currency: string;
  exchangeRate: number | null;
  createdAt: string;
  parentOrderId: string | null;
  parent: { id: string; orderNumber: string } | null;
  children: ContactOrderMovementChild[];
  returnsSummary: ContactOrderReturnSummary[];
  paymentsSummary: ContactOrderPaymentSummary[];
  counts: ContactOrderMovementCounts;
};

export type ContactOrdersMovementResponse = {
  items: ContactOrderMovementNode[];
  total: number;
  page: number;
  pageSize: number;
};

export const CONTACT_ORDER_PAYMENTS_PREVIEW_LIMIT = 5;
