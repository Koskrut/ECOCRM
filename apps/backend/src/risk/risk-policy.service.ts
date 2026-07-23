import { BadRequestException, Injectable } from "@nestjs/common";
import type { RiskDecisionOutcome } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_CREDIT_POLICY } from "./risk.constants";
import { RiskExposureService } from "./risk-exposure.service";
import { RiskScorecardService } from "./risk-scorecard.service";
import type { RiskGateEvaluation } from "./risk.types";

@Injectable()
export class RiskPolicyService {
  constructor(
    private readonly exposure: RiskExposureService,
    private readonly scorecard: RiskScorecardService,
    private readonly prisma: PrismaService,
  ) {}

  async evaluateDeferredGate(input: {
    contactId?: string | null;
    companyId?: string | null;
    orderId?: string | null;
    totalAmount: number;
    paymentType: string;
    requestedById?: string;
  }): Promise<RiskGateEvaluation> {
    if (input.paymentType !== "DEFERRED") {
      return {
        outcome: "ALLOW",
        domain: "CLIENT_CREDIT",
        gatePoint: "ORDER_DEFERRED",
        reasons: [],
      };
    }

    const exposure = await this.exposure.computeExposure({
      contactId: input.contactId,
      companyId: input.companyId,
      additionalAmount: input.totalAmount,
    });

    const blocked = exposure.profile?.status === "BLOCKED" || exposure.profile?.status === "HOLD";
    const scoreResult = this.scorecard.scoreCreditExposure({
      exposurePct: exposure.exposurePct,
      blocked,
      subjectType: input.contactId ? "CONTACT" : input.companyId ? "COMPANY" : "ORDER",
      subjectId: input.contactId ?? input.companyId ?? input.orderId ?? "unknown",
    });

    let outcome: RiskDecisionOutcome = "ALLOW";
    const { warnExposurePct, approveExposurePct, blockExposurePct } = DEFAULT_CREDIT_POLICY;

    if (blocked || exposure.exposurePct >= blockExposurePct) {
      outcome = "BLOCK";
    } else if (exposure.exposurePct >= approveExposurePct) {
      outcome = "REQUIRE_APPROVAL";
    } else if (exposure.exposurePct >= warnExposurePct) {
      outcome = "WARN";
    }

    const overdueKnockout = await this.hasSevereOverdue(input.contactId, input.companyId);
    if (overdueKnockout) outcome = "BLOCK";

    const evaluation: RiskGateEvaluation = {
      outcome,
      domain: "CLIENT_CREDIT",
      gatePoint: "ORDER_DEFERRED",
      reasons: scoreResult.reasons,
      score: scoreResult.score,
      band: scoreResult.band,
    };

    if (input.orderId) {
      await this.prisma.riskDecision.create({
        data: {
          domain: "CLIENT_CREDIT",
          gatePoint: "ORDER_DEFERRED",
          outcome,
          subjectType: input.contactId ? "CONTACT" : input.companyId ? "COMPANY" : "ORDER",
          subjectId: input.contactId ?? input.companyId ?? input.orderId,
          orderId: input.orderId,
          reasons: scoreResult.reasons as object,
          scoreSnapshot: { score: scoreResult.score, band: scoreResult.band, exposurePct: exposure.exposurePct },
          requestedById: input.requestedById,
        },
      });
    }

    return evaluation;
  }

  async evaluateShipGate(input: { orderId: string; hasTtn: boolean; orderStage?: string | null }) {
    if (input.orderStage === "READY_TO_SHIP" && !input.hasTtn) {
      return {
        outcome: "BLOCK" as RiskDecisionOutcome,
        domain: "SHIP" as const,
        gatePoint: "READY_TO_SHIP",
        reasons: [
          {
            code: "MISSING_TTN",
            weight: 40,
            direction: "negative" as const,
            explanationUk: "Немає ТТН для відправки",
            explanationEn: "Missing TTN for shipment",
          },
        ],
      };
    }
    return { outcome: "ALLOW" as RiskDecisionOutcome, domain: "SHIP" as const, gatePoint: "READY_TO_SHIP", reasons: [] };
  }

  async approveDecision(decisionId: string, approverId: string) {
    const decision = await this.prisma.riskDecision.findUnique({ where: { id: decisionId } });
    if (!decision) throw new BadRequestException("Decision not found");
    if (decision.outcome !== "REQUIRE_APPROVAL") {
      throw new BadRequestException("Decision is not pending approval");
    }
    return this.prisma.riskDecision.update({
      where: { id: decisionId },
      data: { approvedById: approverId, approvedAt: new Date(), outcome: "ALLOW" },
    });
  }

  private async hasSevereOverdue(contactId?: string | null, companyId?: string | null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DEFAULT_CREDIT_POLICY.blockOverdueDays);
    const where = {
      financialStatus: "OVERDUE" as const,
      paymentDueDate: { lt: cutoff },
      debtAmount: { gt: 0 },
      ...(contactId ? { clientId: contactId } : companyId ? { companyId } : {}),
    };
    if (!contactId && !companyId) return false;
    const count = await this.prisma.order.count({ where });
    return count > 0;
  }
}
