export type ContactCardSummaryResponse = {
  contact: {
    id: string;
    fullName: string;
    company: { id: string; name: string } | null;
    owner: { id: string; name: string } | null;
    status: string | null;
    clientType: string | null;
    city: string | null;
    region: string | null;
    address: string | null;
    email: string | null;
    phones: string[];
    isUnassigned: boolean;
    badges: string[];
  };
  kpi: {
    ordersCount: number;
    revenue: number;
    debt: number;
    overdue: number;
    /** Sum of order-level overpayments (creditAmount). */
    orderCredit: number;
    clientBalance: number;
    lastOrderAt: string | null;
    lastActivityAt: string | null;
    openTasksCount: number;
    overdueTasksCount: number;
  };
  insights: {
    nextStep: { title: string; dueAt: string | null } | null;
    riskFlags: string[];
    financeRestricted: boolean;
    scopeNote: string | null;
  };
};

export type ContactCardAnalyticsRange = "30d" | "90d" | "365d";
export type ContactCardAnalyticsScope = "contact" | "company";

export type ContactCardAnalyticsResponse = {
  meta: {
    range: ContactCardAnalyticsRange;
    scope: ContactCardAnalyticsScope;
    financeRestricted: boolean;
    scopeNote: string | null;
    companyScopeAvailable: boolean;
  };
  kpi: {
    revenue: number;
    ordersCount: number;
    avgOrderValue: number;
  };
  series: {
    revenueByPeriod: Array<{ date: string; revenue: number }>;
    ordersByPeriod: Array<{ date: string; ordersCount: number }>;
  };
  topProducts: Array<{
    productId: string | null;
    productName: string;
    qty: number;
    revenue: number;
  }>;
};

