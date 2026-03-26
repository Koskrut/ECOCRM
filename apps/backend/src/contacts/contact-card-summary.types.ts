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

