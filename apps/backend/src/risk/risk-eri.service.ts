import { Injectable } from "@nestjs/common";
import type { RiskBand, RiskDomainId } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_DOMAIN_WEIGHTS, ERI_MODEL_VERSION, RISK_DOMAIN_REGISTRY, scoreToBand } from "./risk.constants";
import { RiskScorecardService } from "./risk-scorecard.service";
import type { DomainAggregateScore, EriBreakdown, RiskScoreResult } from "./risk.types";

@Injectable()
export class RiskEriService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scorecard: RiskScorecardService,
  ) {}

  computeEri(scores: RiskScoreResult[], weights: Record<RiskDomainId, number> = DEFAULT_DOMAIN_WEIGHTS) {
    const domains = RISK_DOMAIN_REGISTRY.map((d) => d.id);
    const breakdown: DomainAggregateScore[] = domains.map((domain) =>
      this.scorecard.aggregateDomain(domain, scores),
    );

    let weightedSum = 0;
    let weightTotal = 0;
    for (const row of breakdown) {
      const w = weights[row.domain] ?? 1;
      if (row.subjectCount === 0) continue;
      weightedSum += row.avgScore * w;
      weightTotal += w;
    }
    const eriScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
    const eriBand = scoreToBand(eriScore);
    return { eriScore, eriBand, breakdown: { domains: breakdown, weights } satisfies EriBreakdown };
  }

  async persistSnapshot(scores: RiskScoreResult[]) {
    const { eriScore, eriBand, breakdown } = this.computeEri(scores);
    return this.prisma.enterpriseRiskSnapshot.create({
      data: {
        eriScore,
        eriBand,
        breakdown: breakdown as object,
        modelVersion: ERI_MODEL_VERSION,
      },
    });
  }

  async getTrend7d(): Promise<number[]> {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const rows = await this.prisma.enterpriseRiskSnapshot.findMany({
      where: { computedAt: { gte: since } },
      orderBy: { computedAt: "asc" },
      select: { eriScore: true },
    });
    return rows.map((r) => r.eriScore);
  }

  async getLatest() {
    return this.prisma.enterpriseRiskSnapshot.findFirst({ orderBy: { computedAt: "desc" } });
  }
}
