import { Injectable } from "@nestjs/common";
import type { RiskDomainId } from "@prisma/client";
import { scoreToBand } from "./risk.constants";
import type { CollectorSignal, RiskReasonEntry, RiskScoreResult } from "./risk.types";

const SEVERITY_WEIGHT: Record<string, number> = {
  INFO: 8,
  WARNING: 18,
  HIGH: 32,
  CRITICAL: 60,
};

const SIGNAL_EXPLANATIONS: Record<string, { uk: string; en: string; weight?: number }> = {
  DEBT_OVERDUE: { uk: "Є прострочена заборгованість", en: "Overdue debt present", weight: 28 },
  DEBT_AGED_30: { uk: "Прострочка понад 30 днів", en: "Debt aged over 30 days", weight: 60 },
  DORMANT_NO_ORDER_90: { uk: "Клієнт без замовлень 90+ днів", en: "No orders in 90+ days", weight: 22 },
  BANK_UNMATCHED: { uk: "Нерозподілені банківські транзакції", en: "Unmatched bank transactions", weight: 25 },
  BANK_NEEDS_REVIEW: { uk: "Транзакції потребують перевірки", en: "Bank transactions need review", weight: 20 },
  RECV_DELTA: { uk: "Розбіжність CRM ↔ 1C", en: "CRM vs 1C receivables delta", weight: 24 },
  FX_WRITE_OFF_PRESENT: { uk: "Є FX write-off", en: "FX write-offs present", weight: 12 },
  ORDERS_AWAITING_STOCK: { uk: "Замовлення чекають на склад", en: "Orders awaiting stock", weight: 26 },
  WIP_OPEN_BATCHES: { uk: "Відкриті WIP партії", en: "Open WIP batches", weight: 15 },
  FACTORY_OVERDUE: { uk: "Прострочені factory PO", en: "Overdue factory orders", weight: 22 },
  ORDERS_REFUSED: { uk: "Відмови при доставці", en: "Delivery refusals", weight: 20 },
  MISSING_TTN: { uk: "Готові до відправки без ТТН", en: "Ready to ship without TTN", weight: 24 },
  GPS_OUTSIDE_RADIUS: { uk: "Візити поза радіусом GPS", en: "Visits outside GPS radius", weight: 28 },
  GPS_NO_FIX: { uk: "Візити без GPS fix", en: "Visits without GPS fix", weight: 18 },
  OVERDUE_TASKS: { uk: "Просрочені задачі команди", en: "Overdue team tasks", weight: 20 },
  STUCK_ORDERS: { uk: "Замовлення без руху 3+ дні", en: "Orders stuck 3+ days", weight: 22 },
  RETURNS_IN_PROGRESS: { uk: "Активні повернення", en: "Returns in progress", weight: 18 },
  WIP_SCRAP: { uk: "Scrap у виробництві", en: "Production scrap", weight: 14 },
  LEADS_NEED_ATTENTION: { uk: "Ліди без дотику", en: "Leads need attention", weight: 16 },
  SNAPSHOT_STALE: { uk: "Застарілий snapshot 1C", en: "Stale 1C inventory snapshot", weight: 30 },
  SNAPSHOT_MISSING: { uk: "Немає snapshot 1C", en: "Missing 1C inventory snapshot", weight: 60 },
  EXPOSURE_HIGH: { uk: "Високе використання ліміту", en: "High credit limit utilization", weight: 30 },
  EXPOSURE_CRITICAL: { uk: "Ліміт перевищено", en: "Credit limit exceeded", weight: 65 },
  PROFILE_BLOCKED: { uk: "Кредитний профіль заблоковано", en: "Credit profile blocked", weight: 80 },
};

@Injectable()
export class RiskScorecardService {
  scoreFromSignals(signals: CollectorSignal[]): RiskScoreResult[] {
    const grouped = new Map<string, CollectorSignal[]>();
    for (const s of signals) {
      const key = `${s.domain}:${s.subjectType}:${s.subjectId}`;
      const arr = grouped.get(key) ?? [];
      arr.push(s);
      grouped.set(key, arr);
    }

    const results: RiskScoreResult[] = [];
    for (const [, group] of grouped) {
      const first = group[0]!;
      const reasons: RiskReasonEntry[] = [];
      let score = 0;
      for (const sig of group) {
        const meta = SIGNAL_EXPLANATIONS[sig.signalCode];
        const weight = meta?.weight ?? SEVERITY_WEIGHT[sig.severity] ?? 10;
        score += weight;
        reasons.push({
          code: sig.signalCode,
          weight,
          direction: "negative",
          explanationUk: meta?.uk ?? sig.signalCode,
          explanationEn: meta?.en ?? sig.signalCode,
        });
      }
      score = Math.min(100, score);
      results.push({
        domain: first.domain,
        subjectType: first.subjectType,
        subjectId: first.subjectId,
        subjectLabel: first.subjectLabel,
        score,
        band: scoreToBand(score),
        reasons,
      });
    }
    return results;
  }

  scoreCreditExposure(input: {
    exposurePct: number;
    blocked: boolean;
    subjectType: RiskScoreResult["subjectType"];
    subjectId: string;
    subjectLabel?: string;
  }): RiskScoreResult {
    const reasons: RiskReasonEntry[] = [];
    let score = 0;
    if (input.blocked) {
      const w = 80;
      score += w;
      reasons.push({
        code: "PROFILE_BLOCKED",
        weight: w,
        direction: "negative",
        explanationUk: SIGNAL_EXPLANATIONS.PROFILE_BLOCKED!.uk,
        explanationEn: SIGNAL_EXPLANATIONS.PROFILE_BLOCKED!.en,
      });
    }
    if (input.exposurePct >= 100) {
      const w = 65;
      score += w;
      reasons.push({
        code: "EXPOSURE_CRITICAL",
        weight: w,
        direction: "negative",
        explanationUk: SIGNAL_EXPLANATIONS.EXPOSURE_CRITICAL!.uk,
        explanationEn: SIGNAL_EXPLANATIONS.EXPOSURE_CRITICAL!.en,
      });
    } else if (input.exposurePct >= 70) {
      const w = 30;
      score += w;
      reasons.push({
        code: "EXPOSURE_HIGH",
        weight: w,
        direction: "negative",
        explanationUk: SIGNAL_EXPLANATIONS.EXPOSURE_HIGH!.uk,
        explanationEn: SIGNAL_EXPLANATIONS.EXPOSURE_HIGH!.en,
      });
    }
    score = Math.min(100, score);
    return {
      domain: "CLIENT_CREDIT",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectLabel: input.subjectLabel,
      score,
      band: scoreToBand(score),
      reasons,
    };
  }

  aggregateDomain(domain: RiskDomainId, scores: RiskScoreResult[]) {
    const domainScores = scores.filter((s) => s.domain === domain);
    if (domainScores.length === 0) {
      return { domain, avgScore: 0, band: scoreToBand(0), criticalCount: 0, highCount: 0, subjectCount: 0 };
    }
    const avgScore = Math.round(
      domainScores.reduce((sum, s) => sum + s.score, 0) / domainScores.length,
    );
    return {
      domain,
      avgScore,
      band: scoreToBand(avgScore),
      criticalCount: domainScores.filter((s) => s.band === "CRITICAL").length,
      highCount: domainScores.filter((s) => s.band === "HIGH").length,
      subjectCount: domainScores.length,
    };
  }
}
