import { RiskBand, RiskDomainId } from "@prisma/client";

export const RISK_MODEL_VERSION = "scorecard-v1";
export const ERI_MODEL_VERSION = "eri-v1";

export type RiskDomainMeta = {
  id: RiskDomainId;
  labelUk: string;
  labelEn: string;
  defaultWeight: number;
  deepLink?: string;
};

export const RISK_DOMAIN_REGISTRY: RiskDomainMeta[] = [
  { id: "CLIENT_CREDIT", labelUk: "Кредит клієнта", labelEn: "Client credit", defaultWeight: 1.5, deepLink: "/receivables" },
  { id: "CLIENT_HEALTH", labelUk: "Утримання клієнта", labelEn: "Client health", defaultWeight: 1.0 },
  { id: "CASH_OPS", labelUk: "Каса та звірка", labelEn: "Cash operations", defaultWeight: 1.3, deepLink: "/payments" },
  { id: "FX", labelUk: "Валютний ризик", labelEn: "FX variance", defaultWeight: 0.8 },
  { id: "INV", labelUk: "Склад", labelEn: "Inventory", defaultWeight: 1.2, deepLink: "/catalog" },
  { id: "MFG", labelUk: "Виробництво", labelEn: "Production", defaultWeight: 1.0, deepLink: "/planning" },
  { id: "SHIP", labelUk: "Логістика NP", labelEn: "Shipping", defaultWeight: 1.0 },
  { id: "FIELD", labelUk: "Поле / GPS", labelEn: "Field GPS", defaultWeight: 0.9, deepLink: "/visits" },
  { id: "TEAM", labelUk: "Виконання команди", labelEn: "Team execution", defaultWeight: 0.8, deepLink: "/tasks" },
  { id: "QA", labelUk: "Якість / повернення", labelEn: "Quality / returns", defaultWeight: 0.9 },
  { id: "LEAD", labelUk: "Pipeline", labelEn: "Lead pipeline", defaultWeight: 0.7, deepLink: "/leads" },
  { id: "SYS", labelUk: "Платформа", labelEn: "Platform health", defaultWeight: 1.1, deepLink: "/settings/health" },
];

export const DEFAULT_DOMAIN_WEIGHTS: Record<RiskDomainId, number> = Object.fromEntries(
  RISK_DOMAIN_REGISTRY.map((d) => [d.id, d.defaultWeight]),
) as Record<RiskDomainId, number>;

export const DEFAULT_CREDIT_POLICY = {
  warnExposurePct: 70,
  approveExposurePct: 90,
  blockExposurePct: 100,
  blockOverdueDays: 30,
  defaultCreditLimit: 100_000,
  defaultCurrency: "UAH",
};

export const DEFAULT_BAND_THRESHOLDS = {
  medium: 35,
  high: 60,
  critical: 80,
};

export function scoreToBand(score: number): RiskBand {
  if (score >= DEFAULT_BAND_THRESHOLDS.critical) return "CRITICAL";
  if (score >= DEFAULT_BAND_THRESHOLDS.high) return "HIGH";
  if (score >= DEFAULT_BAND_THRESHOLDS.medium) return "MEDIUM";
  return "LOW";
}

export const SEED_PLAYBOOKS = [
  {
    key: "credit-critical-control-payment",
    domain: "CLIENT_CREDIT" as RiskDomainId,
    triggerBand: "CRITICAL" as RiskBand,
    actions: [{ type: "CREATE_TASK", taskType: "CONTROL_PAYMENT" }],
  },
  {
    key: "inv-high-warehouse-alert",
    domain: "INV" as RiskDomainId,
    triggerBand: "HIGH" as RiskBand,
    actions: [{ type: "NOTIFY_ROLE", role: "WAREHOUSE" }],
  },
  {
    key: "sys-snapshot-stale-freeze",
    domain: "SYS" as RiskDomainId,
    triggerBand: "CRITICAL" as RiskBand,
    actions: [{ type: "FREEZE_PACKING" }],
  },
] as const;
