/**
 * Scenario library: business configuration for outbound AI calls (code-first, versioned).
 * Used for prompt assembly, field extraction schema, and CRM outcome mapping.
 */

export type ScenarioCode = "LEAD_QUALIFICATION" | "DORMANT_REACTIVATION";

export type ScenarioOutcomeBucket = "SUCCESS" | "NEUTRAL" | "FAILED" | "HANDOFF";

export type CapturedFieldType = "string" | "number" | "enum" | "boolean";

export interface CapturedFieldDef {
  key: string;
  label: string;
  labelUk: string;
  type: CapturedFieldType;
  enumValues?: string[];
  required?: boolean;
}

/** CRM side-effects when this outcome is selected after analysis. */
export interface OutcomeCrmAction {
  bucket: ScenarioOutcomeBucket;
  /** Create ActivityType.COMMENT on linked lead/contact/company */
  createActivityComment: boolean;
  activityTitleTemplate?: string;
  createFollowUpTask: boolean;
  taskTitleTemplate?: string;
  taskBodyTemplate?: string;
  taskDueHoursFromNow?: number;
  assignTaskToContactOwner: boolean;
  assignTaskToLeadOwner: boolean;
  /** Uses campaign.config.defaultAssigneeUserId when owners missing */
  assignTaskToCampaignDefault: boolean;
  appendLeadEventNote?: boolean;
}

export interface OutcomeMappingEntry {
  /** Machine outcome key from AI / webhook (e.g. QUALIFIED_MANAGER_HANDOFF) */
  outcomeKey: string;
  description: string;
  crm: OutcomeCrmAction;
}

export interface ScenarioDefinition {
  code: ScenarioCode;
  version: string;
  name: string;
  nameUk: string;
  goal: string;
  goalUk: string;
  targetSegment: string;
  targetSegmentUk: string;
  entryConditionsSummary: string;
  entryConditionsSummaryUk: string;
  requiredContextKeys: string[];
  openings: string[];
  openingsUk: string[];
  qualificationQuestions: string[];
  qualificationQuestionsUk: string[];
  branchLogicSummary: string;
  branchLogicSummaryUk: string;
  objectionHandlingSummary: string;
  objectionHandlingSummaryUk: string;
  allowedActions: string[];
  allowedActionsUk: string[];
  forbiddenClaims: string[];
  forbiddenClaimsUk: string[];
  escalationRules: string[];
  escalationRulesUk: string[];
  successOutcomes: string[];
  neutralOutcomes: string[];
  failedOutcomes: string[];
  captureFields: CapturedFieldDef[];
  outcomeMappings: OutcomeMappingEntry[];
  handoffRules: string[];
  handoffRulesUk: string[];
  followUpRules: string[];
  followUpRulesUk: string[];
  /** Short hints for LLM / voice provider system instructions */
  systemPromptHints: string;
}
