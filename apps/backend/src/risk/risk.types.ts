import type { RiskBand, RiskDecisionOutcome, RiskDomainId, RiskSubjectType } from "@prisma/client";

export type RiskReasonEntry = {
  code: string;
  weight: number;
  direction: "positive" | "negative";
  explanationUk: string;
  explanationEn: string;
};

export type RiskScoreResult = {
  domain: RiskDomainId;
  subjectType: RiskSubjectType;
  subjectId: string;
  subjectLabel?: string;
  score: number;
  band: RiskBand;
  reasons: RiskReasonEntry[];
};

export type DomainAggregateScore = {
  domain: RiskDomainId;
  avgScore: number;
  band: RiskBand;
  criticalCount: number;
  highCount: number;
  subjectCount: number;
};

export type EriBreakdown = {
  domains: DomainAggregateScore[];
  weights: Record<RiskDomainId, number>;
};

export type RiskGateEvaluation = {
  outcome: RiskDecisionOutcome;
  domain: RiskDomainId;
  gatePoint: string;
  reasons: RiskReasonEntry[];
  score?: number;
  band?: RiskBand;
  decisionId?: string;
  approvalSatisfied?: boolean;
};

export type CollectorSignal = {
  domain: RiskDomainId;
  signalCode: string;
  severity: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
  subjectType: RiskSubjectType;
  subjectId: string;
  subjectLabel?: string;
  payload?: Record<string, unknown>;
};
