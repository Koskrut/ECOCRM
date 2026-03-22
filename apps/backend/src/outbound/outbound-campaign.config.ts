/** JSON `OutboundCampaign.config` shape (planning-level contract). */
export type OutboundCampaignConfigJson = {
  maxCallsPerDay?: number;
  dormantDaysMin?: number;
  defaultAssigneeUserId?: string;
  /** Local wall-clock, e.g. "21:00" — interpreted in server timezone for MVP */
  quietHours?: { start: string; end: string };
  timezone?: string;
};
