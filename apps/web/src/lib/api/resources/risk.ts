import { apiGet, apiPatch, apiPost } from "../client";

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskDomainId =
  | "CLIENT_CREDIT"
  | "CLIENT_HEALTH"
  | "CASH_OPS"
  | "FX"
  | "INV"
  | "MFG"
  | "SHIP"
  | "FIELD"
  | "TEAM"
  | "QA"
  | "LEAD"
  | "SYS";

export type RiskScore = {
  id?: string;
  domain: RiskDomainId;
  subjectType: string;
  subjectId: string;
  subjectLabel?: string;
  score: number;
  band: RiskBand;
  reasons: unknown;
  computedAt: string;
};

export type RiskHub = {
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
  criticalSubjects: RiskScore[];
  pendingApprovals: {
    id: string;
    domain: RiskDomainId;
    gatePoint: string;
    outcome: string;
    subjectType: string;
    subjectId: string;
    orderId: string | null;
    reasons: unknown;
    createdAt: string;
    approvedAt: string | null;
  }[];
  deepLinks: { label: string; href: string }[];
};

export type RiskGateResult = {
  outcome: "ALLOW" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
  domain: RiskDomainId;
  gatePoint: string;
  reasons: { explanationUk?: string; explanationEn?: string; code: string }[];
  score?: number;
  band?: RiskBand;
};

export const riskApi = {
  getHub: () => apiGet<RiskHub>("/risk/hub"),
  getScores: (params?: { domain?: RiskDomainId; subjectType?: string; subjectId?: string }) => {
    const q = new URLSearchParams();
    if (params?.domain) q.set("domain", params.domain);
    if (params?.subjectType) q.set("subjectType", params.subjectType);
    if (params?.subjectId) q.set("subjectId", params.subjectId);
    const qs = q.toString();
    return apiGet<RiskScore[]>(`/risk/scores${qs ? `?${qs}` : ""}`);
  },
  recompute: () => apiPost<{ signalCount: number; scoreCount: number }>("/risk/recompute"),
  evaluateDeferred: (body: {
    contactId?: string | null;
    companyId?: string | null;
    orderId?: string | null;
    totalAmount: number;
    paymentType: string;
  }) => apiPost<RiskGateResult>("/risk/evaluate/deferred", body),
  approveDecision: (id: string) => apiPost(`/risk/decisions/${id}/approve`, {}),
};
