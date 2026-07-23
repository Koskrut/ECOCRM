import type { RiskBand, RiskDecisionOutcome, RiskDomainId, RiskSubjectType } from "@prisma/client";

export type RiskHubResponse = {
  eri: {
    score: number;
    band: RiskBand;
    computedAt: string | null;
    trend7d: number[];
  };
  domainHeatmap: {
    domain: RiskDomainId;
    labelUk: string;
    labelEn: string;
    avgScore: number;
    band: RiskBand;
    criticalCount: number;
    highCount: number;
    deepLink?: string;
  }[];
  criticalSubjects: RiskScoreDto[];
  pendingApprovals: RiskDecisionDto[];
  deepLinks: { label: string; href: string }[];
};

export type RiskScoreDto = {
  id?: string;
  domain: RiskDomainId;
  subjectType: RiskSubjectType;
  subjectId: string;
  subjectLabel?: string;
  score: number;
  band: RiskBand;
  reasons: unknown;
  computedAt: string;
};

export type RiskDecisionDto = {
  id: string;
  domain: RiskDomainId;
  gatePoint: string;
  outcome: RiskDecisionOutcome;
  subjectType: RiskSubjectType;
  subjectId: string;
  orderId: string | null;
  reasons: unknown;
  createdAt: string;
  approvedAt: string | null;
};

export type EvaluateDeferredGateDto = {
  contactId?: string | null;
  companyId?: string | null;
  orderId?: string | null;
  totalAmount: number;
  paymentType: string;
};

export type CreditProfileDto = {
  id: string;
  contactId: string | null;
  companyId: string | null;
  creditLimit: number;
  currency: string;
  utilizedExposure: number;
  availableCredit: number;
  riskClass: string;
  status: string;
  paymentTermsDays: number;
};

export type UpdateCreditProfileDto = {
  creditLimit?: number;
  currency?: string;
  riskClass?: string;
  status?: string;
  paymentTermsDays?: number;
  notes?: string | null;
};

export type ApproveDecisionDto = {
  note?: string;
};
