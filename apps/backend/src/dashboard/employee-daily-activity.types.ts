export type EmployeePresenceStatus = "online" | "was_today" | "absent";

export type EmployeeDailyActivitySort = "activeTime" | "payments" | "actions";

export type EmployeeOrderPreview = {
  orderId: string;
  orderNumber: string;
  clientName: string | null;
  amount: number;
  currency: string;
  stage: string | null;
  kind: "created" | "status_changed";
};

export type EmployeeDailyActivityRow = {
  userId: string;
  fullName: string;
  role: string;
  leadId: string | null;
  presence: {
    status: EmployeePresenceStatus;
    firstAt: string | null;
    lastAt: string | null;
    activeSeconds: number;
  };
  payments: {
    count: number;
    amountsByCurrency: Record<string, number>;
    uniqueOrders: number;
    matchAudits: number;
  };
  orders: {
    createdCount: number;
    statusChangedCount: number;
    previews: EmployeeOrderPreview[];
  };
  shipping: {
    shipmentCount: number;
    ttnCount: number;
    ttnNumbers: string[];
  };
  tasks: {
    created: number;
    completed: number;
    byTitleGroup: {
      paymentControl: number;
      callback: number;
      other: number;
    };
  };
  crm: {
    activities: number;
    contacts: number;
    companies: number;
    leads: number;
    visits: number;
  };
  actionCount: number;
  systemSideEffectsCount: number;
};

export type EmployeeDailyActivityPayload = {
  date: string;
  sort: EmployeeDailyActivitySort;
  rows: EmployeeDailyActivityRow[];
};

export type EmployeeTimelineEvent = {
  at: string;
  kind: string;
  label: string;
  entityType: string | null;
  entityId: string | null;
  orderNumber: string | null;
  clientName: string | null;
  amount: number | null;
  currency: string | null;
  meta?: Record<string, unknown>;
};

export type EmployeeTimelinePayload = {
  date: string;
  userId: string;
  fullName: string;
  events: EmployeeTimelineEvent[];
};
