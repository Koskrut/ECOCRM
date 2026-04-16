export type ContactPriorityReasonCode =
  | "OVERDUE_FOLLOWUP"
  | "NEW_LEAD_NO_FIRST_CONTACT"
  | "NO_CONTACT_14_DAYS"
  | "NO_ORDER_30_DAYS"
  | "HAS_DEBT"
  | "HIGH_VALUE_CLIENT"
  | "RETURN_TO_WORK"
  | "AT_RISK"
  | "DORMANT";

export type ContactExclusionCode =
  | "DO_NOT_DISTURB"
  | "NON_TARGET_STATUS"
  | "DUPLICATE_MARKED";

export type ContactScoringSignal = {
  contactId: string;
  daysSinceCreated: number;
  lastContactAt: Date | null;
  lastOrderAt: Date | null;
  daysSinceLastContact: number | null;
  daysSinceLastOrder: number | null;
  hasOrderHistory: boolean;
  overdueFollowupTasks: number;
  openTasksCount: number;
  debtAmount: number;
  revenue30: number;
  revenue90: number;
  revenue365: number;
  ordersCount30: number;
  ordersCount90: number;
  ordersCount365: number;
  avgCheck90: number;
  avgCheck365: number;
  isNewLeadNoFirstContact: boolean;
  isDormant: boolean;
  isAtRisk: boolean;
};

export type ContactScoreBreakdownEntry = {
  code: ContactPriorityReasonCode;
  weight: number;
  value: number;
  explanation: string;
};

export type ContactPriorityResult = {
  score: number;
  reasons: ContactPriorityReasonCode[];
  breakdown: ContactScoreBreakdownEntry[];
};

export type ContactSuggestionResult = {
  suggestedStage:
    | "NEW_LEAD"
    | "IN_PROGRESS"
    | "WAITING_DECISION"
    | "ACTIVE_CLIENT"
    | "DORMANT_CLIENT"
    | "AT_RISK"
    | "PROBLEM_DEBT"
    | "LOST_CLIENT"
    | null;
  suggestedNextActionType:
    | "CALL"
    | "MESSAGE"
    | "SEND_OFFER"
    | "CONTROL_PAYMENT"
    | "MEETING"
    | "NO_ACTION";
  explanation: string[];
};
