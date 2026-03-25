/** Відповідь GET /contacts/:id/card (UK copy у UI). */

export type ContactCardOrderRow = {
  id: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  orderStage: string | null;
  debtAmount: number;
  financialStatus: string | null;
  paymentDueDate: string | null;
  createdAt: string;
};

export type ContactCardPayload = {
  kpi: {
    orderCount: number;
    totalRevenue: number;
    totalDebt: number;
    overdueDebt: number;
    averageOrderValue: number;
    lastOrderAt: string | null;
    lastActivityAt: string | null;
  };
  kpiAccess: {
    showPartialDataNotice: boolean;
    partialDataNotice: string;
  };
  canonicalOrders: { total: number; items: ContactCardOrderRow[] };
  legacyLinkedOrders: { total: number; items: ContactCardOrderRow[] };
  companyOrders: { total: number; items: ContactCardOrderRow[] };
};
