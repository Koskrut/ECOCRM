import { Injectable } from "@nestjs/common";
import type { RiskBand, RiskDomainId, RiskSubjectType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RISK_DOMAIN_REGISTRY, RISK_MODEL_VERSION } from "./risk.constants";
import { RiskCollectorsService } from "./risk-collectors.service";
import { RiskEriService } from "./risk-eri.service";
import { RiskExposureService } from "./risk-exposure.service";
import { RiskMlChallengerService } from "./risk-ml-challenger.service";
import { RiskPlaybooksService } from "./risk-playbooks.service";
import { RiskPolicyService } from "./risk-policy.service";
import { RiskScorecardService } from "./risk-scorecard.service";
import type { RiskHubResponse, RiskScoreDto } from "./dto/risk.dto";

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
    await this.prisma.riskSignalEvent.createMany({
      data: signals.map((s) => ({
        domain: s.domain,
        signalCode: s.signalCode,
        severity: s.severity,
        subjectType: s.subjectType,
        subjectId: s.subjectId,
        payload: s.payload as object | undefined,
      })),
    });

    let scores = this.scorecard.scoreFromSignals(signals);
    scores = this.ml.enrichScores(scores);

    for (const score of scores) {
      await this.prisma.riskScoreSnapshot.upsert({
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
        },
      });
    }

    await this.eri.persistSnapshot(scores);
    await this.playbooks.runForScores(scores.filter((s) => s.band === "HIGH" || s.band === "CRITICAL"));
    return { signalCount: signals.length, scoreCount: scores.length };
  }

  async getHub(): Promise<RiskHubResponse> {
    const [latest, trend7d, criticalSubjects, pendingApprovals] = await Promise.all([
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
    ]);

    const allDomainScores = await this.prisma.riskScoreSnapshot.findMany({
      select: { domain: true, score: true, band: true },
    });
    const grouped = RISK_DOMAIN_REGISTRY.map((meta) => {
      const rows = allDomainScores.filter((r) => r.domain === meta.id);
      const avgScore =
        rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
      const band: RiskBand = rows.length
          ? rows.some((r) => r.band === "CRITICAL")
            ? "CRITICAL"
            : rows.some((r) => r.band === "HIGH")
              ? "HIGH"
              : rows.some((r) => r.band === "MEDIUM")
                ? "MEDIUM"
                : "LOW"
          : "LOW";
      return {
        domain: meta.id,
        labelUk: meta.labelUk,
        labelEn: meta.labelEn,
        avgScore,
        band,
        criticalCount: rows.filter((r) => r.band === "CRITICAL").length,
        highCount: rows.filter((r) => r.band === "HIGH").length,
        deepLink: meta.deepLink,
      };
    });

    return {
      eri: {
        score: latest?.eriScore ?? 0,
        band: latest?.eriBand ?? "LOW",
        computedAt: latest?.computedAt.toISOString() ?? null,
        trend7d,
      },
      domainHeatmap: grouped,
      criticalSubjects: criticalSubjects.map(mapSnapshot),
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
        { label: "Receivables", href: "/receivables" },
        { label: "Payments", href: "/payments" },
        { label: "Planning", href: "/planning" },
        { label: "Tasks", href: "/tasks" },
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
    return rows.map(mapSnapshot);
  }

  getExposure(input: { contactId?: string; companyId?: string; additionalAmount?: number }) {
    return this.exposure.computeExposure(input);
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

  updateCreditProfile(id: string, data: Parameters<RiskExposureService["updateProfile"]>[1]) {
    return this.exposure.updateProfile(id, data);
  }

  async getAttentionFromRisk() {
    const critical = await this.prisma.riskScoreSnapshot.findMany({
      where: { band: { in: ["CRITICAL", "HIGH"] } },
      orderBy: { score: "desc" },
      take: 20,
    });
    return critical.map((s) => ({
      domain: s.domain,
      subjectType: s.subjectType,
      subjectId: s.subjectId,
      score: s.score,
      band: s.band,
      reasons: s.reasons,
    }));
  }
}

function mapSnapshot(s: {
  id: string;
  domain: RiskDomainId;
  subjectType: RiskSubjectType;
  subjectId: string;
  score: number;
  band: RiskScoreDto["band"];
  reasons: unknown;
  computedAt: Date;
}): RiskScoreDto {
  return {
    id: s.id,
    domain: s.domain,
    subjectType: s.subjectType,
    subjectId: s.subjectId,
    score: s.score,
    band: s.band,
    reasons: s.reasons,
    computedAt: s.computedAt.toISOString(),
  };
}
