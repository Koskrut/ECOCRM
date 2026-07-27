import { Injectable } from "@nestjs/common";
import type { RiskBand, RiskDomainId, RiskSubjectType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_CREDIT_POLICY, RISK_DOMAIN_REGISTRY, RISK_MODEL_VERSION } from "./risk.constants";
import { RiskCollectorsService } from "./risk-collectors.service";
import { RiskEriService } from "./risk-eri.service";
import { RiskExposureService } from "./risk-exposure.service";
import { RiskMlChallengerService } from "./risk-ml-challenger.service";
import { RiskPlaybooksService } from "./risk-playbooks.service";
import { RiskPolicyService } from "./risk-policy.service";
import { RiskScorecardService } from "./risk-scorecard.service";
import type { RiskHubResponse, RiskScoreDto } from "./dto/risk.dto";

const SIGNAL_RETENTION_DAYS = 90;

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collectors: RiskCollectorsService,
    private readonly scorecard: RiskScorecardService,
    private readonly eri: RiskEriService,
    private readonly exposure: RiskExposureService,
    private readonly policy: RiskPolicyService,
    private readonly playbooks: RiskPlaybooksService,
    private readonly ml: RiskMlChallengerService,
  ) {}

  async recomputeAll() {
    const signals = await this.collectors.collectAll();
    let scores = this.scorecard.scoreFromSignals(signals);
    scores = this.ml.enrichScores(scores);

    const scoreKeys = new Set(scores.map((s) => `${s.domain}:${s.subjectType}:${s.subjectId}`));

    await this.prisma.$transaction(async (tx) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - SIGNAL_RETENTION_DAYS);
      await tx.riskSignalEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });

      if (signals.length > 0) {
        await tx.riskSignalEvent.createMany({
          data: signals.map((s) => ({
            domain: s.domain,
            signalCode: s.signalCode,
            severity: s.severity,
            subjectType: s.subjectType,
            subjectId: s.subjectId,
            payload: s.payload as object | undefined,
          })),
        });
      }

      for (const score of scores) {
        await tx.riskScoreSnapshot.upsert({
          where: {
            domain_subjectType_subjectId: {
              domain: score.domain,
              subjectType: score.subjectType,
              subjectId: score.subjectId,
            },
          },
          create: {
            domain: score.domain,
            subjectType: score.subjectType,
            subjectId: score.subjectId,
            score: score.score,
            band: score.band,
            reasons: score.reasons as object,
            modelVersion: RISK_MODEL_VERSION,
          },
          update: {
            score: score.score,
            band: score.band,
            reasons: score.reasons as object,
            computedAt: new Date(),
            modelVersion: RISK_MODEL_VERSION,
          },
        });
      }

      const existing = await tx.riskScoreSnapshot.findMany({
        select: { id: true, domain: true, subjectType: true, subjectId: true },
      });
      const staleIds = existing
        .filter((row) => !scoreKeys.has(`${row.domain}:${row.subjectType}:${row.subjectId}`))
        .map((row) => row.id);
      if (staleIds.length > 0) {
        await tx.riskScoreSnapshot.deleteMany({ where: { id: { in: staleIds } } });
      }
    });

    await this.eri.persistSnapshot(scores);
    await this.playbooks.runForScores(scores.filter((s) => s.band === "HIGH" || s.band === "CRITICAL"));
    return { signalCount: signals.length, scoreCount: scores.length };
  }

  async getHub(): Promise<RiskHubResponse> {
    const [latest, trend7d, criticalSubjects, pendingApprovals, bandAggregates] = await Promise.all([
      this.eri.getLatest(),
      this.eri.getTrend7d(),
      this.prisma.riskScoreSnapshot.findMany({
        where: { band: { in: ["CRITICAL", "HIGH"] } },
        orderBy: [{ band: "desc" }, { score: "desc" }],
        take: 30,
      }),
      this.prisma.riskDecision.findMany({
        where: { outcome: "REQUIRE_APPROVAL", approvedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.riskScoreSnapshot.groupBy({
        by: ["domain", "band"],
        _count: { _all: true },
        _avg: { score: true },
      }),
    ]);

    const domainStats = new Map<
      RiskDomainId,
      { totalScore: number; count: number; criticalCount: number; highCount: number; bands: Set<RiskBand> }
    >();
    for (const row of bandAggregates) {
      const current = domainStats.get(row.domain) ?? {
        totalScore: 0,
        count: 0,
        criticalCount: 0,
        highCount: 0,
        bands: new Set<RiskBand>(),
      };
      const rowCount = row._count._all;
      current.totalScore += (row._avg.score ?? 0) * rowCount;
      current.count += rowCount;
      if (row.band === "CRITICAL") current.criticalCount += rowCount;
      if (row.band === "HIGH") current.highCount += rowCount;
      current.bands.add(row.band);
      domainStats.set(row.domain, current);
    }

    const grouped = RISK_DOMAIN_REGISTRY.map((meta) => {
      const stats = domainStats.get(meta.id);
      const avgScore = stats && stats.count > 0 ? Math.round(stats.totalScore / stats.count) : 0;
      const band: RiskBand = stats?.bands.has("CRITICAL")
        ? "CRITICAL"
        : stats?.bands.has("HIGH")
          ? "HIGH"
          : stats?.bands.has("MEDIUM")
            ? "MEDIUM"
            : "LOW";
      return {
        domain: meta.id,
        labelUk: meta.labelUk,
        labelEn: meta.labelEn,
        avgScore,
        band,
        criticalCount: stats?.criticalCount ?? 0,
        highCount: stats?.highCount ?? 0,
        deepLink: meta.deepLink,
      };
    });

    const enrichedCritical = await this.enrichSubjectLabels(criticalSubjects);

    return {
      eri: {
        score: latest?.eriScore ?? 0,
        band: latest?.eriBand ?? "LOW",
        computedAt: latest?.computedAt.toISOString() ?? null,
        trend7d,
      },
      domainHeatmap: grouped,
      criticalSubjects: enrichedCritical.map(mapSnapshot),
      pendingApprovals: pendingApprovals.map((d) => ({
        id: d.id,
        domain: d.domain,
        gatePoint: d.gatePoint,
        outcome: d.outcome,
        subjectType: d.subjectType,
        subjectId: d.subjectId,
        orderId: d.orderId,
        reasons: d.reasons,
        createdAt: d.createdAt.toISOString(),
        approvedAt: d.approvedAt?.toISOString() ?? null,
      })),
      deepLinks: [
        { labelUk: "Дебіторка", labelEn: "Receivables", href: "/receivables" },
        { labelUk: "Платежі", labelEn: "Payments", href: "/payments" },
        { labelUk: "Планування", labelEn: "Planning", href: "/planning" },
        { labelUk: "Задачі", labelEn: "Tasks", href: "/tasks" },
      ],
    };
  }

  async getScores(query: { domain?: RiskDomainId; subjectType?: RiskSubjectType; subjectId?: string }) {
    const rows = await this.prisma.riskScoreSnapshot.findMany({
      where: {
        domain: query.domain,
        subjectType: query.subjectType,
        subjectId: query.subjectId,
      },
      orderBy: { computedAt: "desc" },
      take: 100,
    });
    const enriched = await this.enrichSubjectLabels(rows);
    return enriched.map(mapSnapshot);
  }

  getExposure(input: {
    contactId?: string;
    companyId?: string;
    additionalAmount?: number;
    excludeOrderId?: string;
    persist?: boolean;
  }) {
    return this.exposure.computeExposure({ ...input, persist: input.persist ?? false });
  }

  evaluateDeferredGate(input: Parameters<RiskPolicyService["evaluateDeferredGate"]>[0]) {
    return this.policy.evaluateDeferredGate(input);
  }

  evaluateShipGate(input: Parameters<RiskPolicyService["evaluateShipGate"]>[0]) {
    return this.policy.evaluateShipGate(input);
  }

  approveDecision(decisionId: string, approverId: string) {
    return this.policy.approveDecision(decisionId, approverId);
  }

  getCreditPolicy() {
    return this.policy.getCreditPolicy();
  }

  updateCreditPolicy(rules: Partial<typeof DEFAULT_CREDIT_POLICY>) {
    return this.policy.updateCreditPolicy(rules);
  }

  updateCreditProfile(id: string, data: Parameters<RiskExposureService["updateProfile"]>[1]) {
    return this.exposure.updateProfile(id, data);
  }

  async getAttentionFromRisk() {
    const critical = await this.prisma.riskScoreSnapshot.findMany({
      where: { band: { in: ["CRITICAL", "HIGH"] } },
      orderBy: { score: "desc" },
      take: 20,
    });
    const enriched = await this.enrichSubjectLabels(critical);
    return enriched.map((s) => ({
      domain: s.domain,
      subjectType: s.subjectType,
      subjectId: s.subjectId,
      subjectLabel: s.subjectLabel,
      score: s.score,
      band: s.band,
      reasons: s.reasons,
    }));
  }

  private async enrichSubjectLabels<
    T extends { subjectType: RiskSubjectType; subjectId: string; reasons: unknown },
  >(rows: T[]): Promise<Array<T & { subjectLabel?: string }>> {
    const contactIds = rows.filter((r) => r.subjectType === "CONTACT").map((r) => r.subjectId);
    const companyIds = rows.filter((r) => r.subjectType === "COMPANY").map((r) => r.subjectId);
    const orderIds = rows.filter((r) => r.subjectType === "ORDER").map((r) => r.subjectId);

    const [contacts, companies, orders] = await Promise.all([
      contactIds.length
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      companyIds.length
        ? this.prisma.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      orderIds.length
        ? this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        : Promise.resolve([]),
    ]);

    const contactMap = new Map(
      contacts.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ") || c.id]),
    );
    const companyMap = new Map(companies.map((c) => [c.id, c.name || c.id]));
    const orderMap = new Map(orders.map((o) => [o.id, o.orderNumber ?? o.id]));

    return rows.map((row) => {
      let subjectLabel: string | undefined;
      if (row.subjectType === "CONTACT") subjectLabel = contactMap.get(row.subjectId);
      else if (row.subjectType === "COMPANY") subjectLabel = companyMap.get(row.subjectId);
      else if (row.subjectType === "ORDER") subjectLabel = orderMap.get(row.subjectId);
      else {
        const reasons = row.reasons as Array<{ explanationUk?: string }> | null;
        subjectLabel = reasons?.[0]?.explanationUk;
      }
      return { ...row, subjectLabel };
    });
  }
}

function mapSnapshot(s: {
  id: string;
  domain: RiskDomainId;
  subjectType: RiskSubjectType;
  subjectId: string;
  subjectLabel?: string;
  score: number;
  band: RiskBand;
  reasons: unknown;
  computedAt: Date;
}): RiskScoreDto {
  return {
    id: s.id,
    domain: s.domain,
    subjectType: s.subjectType,
    subjectId: s.subjectId,
    subjectLabel: s.subjectLabel,
    score: s.score,
    band: s.band,
    reasons: s.reasons,
    computedAt: s.computedAt.toISOString(),
  };
}
