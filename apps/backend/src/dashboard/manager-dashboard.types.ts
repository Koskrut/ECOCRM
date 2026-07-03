export type ManagerInboxTiles = {
  leadsWithoutTouch: number;
  neverContactedNewLeads: number;
  staleInProgressLeads: number;
  overdueFollowupContacts: number;
  newNoFirstContactContacts: number;
  overdueTasks: number;
  overduePayments: number;
  debtControlContacts: number;
};

export type ManagerInboxTask = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  leadId: string | null;
  contactId: string | null;
  assigneeName: string | null;
};

export type ManagerInboxTasks = {
  overdue: ManagerInboxTask[];
  today: ManagerInboxTask[];
  tomorrow: ManagerInboxTask[];
};

export type ManagerPipelineCounts = {
  NEW: number;
  IN_PROGRESS: number;
  WON: number;
  LOST: number;
};

export type ManagerHotLead = {
  id: string;
  name: string;
  source: string | null;
  daysSinceActivity: number | null;
  hasOverdueTask: boolean;
};

export type ManagerInboxResponse = {
  tiles: ManagerInboxTiles;
  tasks: ManagerInboxTasks;
  pipelineCounts: ManagerPipelineCounts;
  hotLeads: ManagerHotLead[];
  totalInQueue: number;
  computedAt: string;
};

export type ManagerActivityMetrics = {
  callsInbound: number;
  callsOutbound: number;
  visits: number;
  ordersCount: number;
  ordersAmount: number;
  paymentsAmount: number;
};

export type ManagerOutcomeMetrics = {
  leadsCreated: number;
  leadsWon: number;
  leadsLost: number;
  wonShare: number;
  exactConversion: number | null;
  bookedRevenue: number;
  collectedPayments: number;
  avgCheck: number;
  activeClientsInQueue: number;
};

export type ManagerScorecardResponse = {
  currency: string;
  period: { from: string; to: string };
  comparePeriod?: { from: string; to: string };
  activity: {
    today: ManagerActivityMetrics;
    period: ManagerActivityMetrics;
    compare?: ManagerActivityMetrics;
  };
  outcomes: ManagerOutcomeMetrics & {
    compare?: Omit<ManagerOutcomeMetrics, "activeClientsInQueue" | "exactConversion">;
  };
};
