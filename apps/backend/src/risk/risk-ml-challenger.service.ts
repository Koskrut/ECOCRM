import { Injectable } from "@nestjs/common";
import type { RiskDomainId } from "@prisma/client";
import type { RiskScoreResult } from "./risk.types";

/**
 * Optional ML challenger layer — never used for hard policy decisions.
 * Returns null until enough labeled outcomes exist.
 */
@Injectable()
export class RiskMlChallengerService {
  predict(_domain: RiskDomainId, _features: Record<string, number>): { score: number; model: string } | null {
    return null;
  }

  enrichScores(scores: RiskScoreResult[]): RiskScoreResult[] {
    return scores.map((s) => {
      const challenger = this.predict(s.domain, { score: s.score });
      if (!challenger) return s;
      return {
        ...s,
        reasons: [
          ...s.reasons,
          {
            code: "ML_CHALLENGER",
            weight: 0,
            direction: "negative" as const,
            explanationUk: `ML challenger: ${challenger.score}`,
            explanationEn: `ML challenger: ${challenger.score}`,
          },
        ],
      };
    });
  }
}
