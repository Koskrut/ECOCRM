import { BadRequestException, Injectable } from "@nestjs/common";
import type { RiskDecisionOutcome, RiskSubjectType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_CREDIT_POLICY } from "./risk.constants";
import { RiskExposureService } from "./risk-exposure.service";
import { RiskScorecardService } from "./risk-scorecard.service";
import type { RiskGateEvaluation } from "./risk.types";

const APPROVAL_WINDOW_MS = 72 * 60 * 60 * 1000;
const DECISION_DEDUP_MS = 24 * 60 * 60 * 1000;

type CreditPolicyRules = typeof DEFAULT_CREDIT_POLICY;

@Injectable()
export class RiskPolicyService {
  constructor(
    private readonly exposure: RiskExposureService,
    private readonly scorecard: RiskScorecardService,
    private readonly prisma: PrismaService,
  ) {}

  async getCreditPolicy(): Promise<CreditPolicyRules> {
    const row = await this.prisma.riskPolicy.findUnique({ where: { domain: "CLIENT_CREDIT" } });
    if (!row || !row.enabled) return DEFAULT_CREDIT_POLICY;
    const rules = row.rules as Partial<CreditPolicyRules>;
    return { ...DEFAULT_CREDIT_POLICY, ...rules };
  }

  async ensureCreditPolicySeed() {
    await this.prisma.riskPolicy.upsert({
      where: { domain: "CLIENT_CREDIT" },
      create: {
        domain: "CLIENT_CREDIT",
        rules: DEFAULT_CREDIT_POLICY as object,
        enabled: true,
      },
      update: {},
    });
  }

  async updateCreditPolicy(rules: Partial<CreditPolicyRules>) {
    await this.ensureCreditPolicySeed();
    const current = await this.getCreditPolicy();
    const merged = { ...current, ...rules };
    return this.prisma.riskPolicy.update({
      where: { domain: "CLIENT_CREDIT" },
      data: { rules: merged as object },
    });
  }

  async evaluateDeferredGate(input: {
    contactId?: string | null;
    companyId?: string | null;
    orderId?: string | null;
    totalAmount: number;
    paymentType: string;
    requestedById?: string;
    persistDecision?: boolean;
  }): Promise<RiskGateEvaluation> {
    if (input.paymentType !== "DEFERRED") {
      return {
        outcome: "ALLOW",
        domain: "CLIENT_CREDIT",
        gatePoint: "ORDER_DEFERRED",
        reasons: [],
      };
    }

    await this.ensureCreditPolicySeed();
    const policy = await this.getCreditPolicy();

    const exposure = await this.exposure.computeExposure({
      contactId: input.contactId,
      companyId: input.companyId,
      additionalAmount: input.totalAmount,
      excludeOrderId: input.orderId ?? undefined,
      persist: false,
    });

    const blocked = exposure.profile?.status === "BLOCKED" || exposure.profile?.status === "HOLD";
    const subjectType: RiskSubjectType = input.contactId ? "CONTACT" : input.companyId ? "COMPANY" : "ORDER";
    const subjectId = input.contactId ?? input.companyId ?? input.orderId ?? "unknown";

    const scoreResult = this.scorecard.scoreCreditExposure({
      exposurePct: exposure.exposurePct,
      blocked,
      subjectType,
      subjectId,
    });

    let outcome: RiskDecisionOutcome = "ALLOW";
    const { warnExposurePct, approveExposurePct, blockExposurePct } = policy;

    if (blocked || exposure.exposurePct >= blockExposurePct) {
      outcome = "BLOCK";
    } else if (exposure.exposurePct >= approveExposurePct) {
      outcome = "REQUIRE_APPROVAL";
    } else if (exposure.exposurePct >= warnExposurePct) {
      outcome = "WARN";
    }

    const overdueKnockout = await this.hasSevereOverdue(input.contactId, input.companyId, policy.blockOverdueDays);
    if (overdueKnockout) outcome = "BLOCK";

    const approvalSatisfied =
      outcome === "REQUIRE_APPROVAL"
        ? await this.hasApprovedDeferredDecision({
            contactId: input.contactId,
            companyId: input.companyId,
            orderId: input.orderId,
            totalAmount: input.totalAmount,
          })
        : false;

    const evaluation: RiskGateEvaluation = {
      outcome,
      domain: "CLIENT_CREDIT",
      gatePoint: "ORDER_DEFERRED",
      reasons: scoreResult.reasons,
      score: scoreResult.score,
      band: scoreResult.band,
      approvalSatisfied,
    };

    if (
      input.persistDecision &&
      (outcome === "REQUIRE_APPROVAL" || outcome === "BLOCK")
    ) {
      const existing = await this.findRecentPendingDecision({
        contactId: input.contactId,
        companyId: input.companyId,
        orderId: input.orderId,
        totalAmount: input.totalAmount,
      });
      if (existing) {
        evaluation.decisionId = existing.id;
        return evaluation;
      }

      const created = await this.prisma.riskDecision.create({
        data: {
          domain: "CLIENT_CREDIT",
          gatePoint: "ORDER_DEFERRED",
          outcome,
          subjectType,
          subjectId,
          orderId: input.orderId ?? null,
          reasons: scoreResult.reasons as object,
          scoreSnapshot: {
            score: scoreResult.score,
            band: scoreResult.band,
            exposurePct: exposure.exposurePct,
            requestedAmount: input.totalAmount,
          },
          requestedById: input.requestedById,
        },
      });
      evaluation.decisionId = created.id;
    }

    return evaluation;
  }

  async hasApprovedDeferredDecision(input: {
    contactId?: string | null;
    companyId?: string | null;
    orderId?: string | null;
    totalAmount: number;
  }): Promise<boolean> {
    const subjectType: RiskSubjectType = input.contactId ? "CONTACT" : input.companyId ? "COMPANY" : "ORDER";
    const subjectId = input.contactId ?? input.companyId ?? input.orderId;
    if (!subjectId) return false;

    const windowStart = new Date(Date.now() - APPROVAL_WINDOW_MS);

    if (input.orderId) {
      const approved = await this.prisma.riskDecision.findFirst({
        where: {
          orderId: input.orderId,
          gatePoint: "ORDER_DEFERRED",
          approvedAt: { not: null },
          outcome: "ALLOW",
        },
        orderBy: { approvedAt: "desc" },
      });
      if (approved && this.coversAmount(approved.scoreSnapshot, input.totalAmount)) return true;
    }

    const approved = await this.prisma.riskDecision.findFirst({
      where: {
        domain: "CLIENT_CREDIT",
        gatePoint: "ORDER_DEFERRED",
        subjectType,
        subjectId,
        approvedAt: { not: null },
        outcome: "ALLOW",
        createdAt: { gte: windowStart },
      },
      orderBy: { approvedAt: "desc" },
    });
    return approved != null && this.coversAmount(approved.scoreSnapshot, input.totalAmount);
  }

  async linkApprovalToOrder(input: {
    contactId?: string | null;
    companyId?: string | null;
    orderId: string;
    totalAmount: number;
  }) {
    const subjectType: RiskSubjectType = input.contactId ? "CONTACT" : input.companyId ? "COMPANY" : "ORDER";
    const subjectId = input.contactId ?? input.companyId;
    if (!subjectId) return;

    const windowStart = new Date(Date.now() - APPROVAL_WINDOW_MS);
    const approved = await this.prisma.riskDecision.findFirst({
      where: {
        domain: "CLIENT_CREDIT",
        gatePoint: "ORDER_DEFERRED",
        subjectType,
        subjectId,
        orderId: null,
        approvedAt: { not: null },
        outcome: "ALLOW",
        createdAt: { gte: windowStart },
      },
      orderBy: { approvedAt: "desc" },
    });
    if (!approved || !this.coversAmount(approved.scoreSnapshot, input.totalAmount)) return;

    await this.prisma.riskDecision.update({
      where: { id: approved.id },
      data: { orderId: input.orderId },
    });
  }

  async evaluateShipGate(input: {
    orderId: string;
    hasTtn: boolean;
    orderStage?: string | null;
    deliveryMethod?: string | null;
  }) {
    // Pickup (самовивіз) does not use Nova Poshta — TTN is not required.
    const requiresTtn = input.deliveryMethod === "NOVA_POSHTA";
    if (input.orderStage === "READY_TO_SHIP" && requiresTtn && !input.hasTtn) {
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

  private coversAmount(scoreSnapshot: unknown, totalAmount: number): boolean {
    const snap = scoreSnapshot as { requestedAmount?: number } | null;
    if (snap?.requestedAmount == null) return true;
    return snap.requestedAmount >= totalAmount;
  }

  private async findRecentPendingDecision(input: {
    contactId?: string | null;
    companyId?: string | null;
    orderId?: string | null;
    totalAmount: number;
  }) {
    const since = new Date(Date.now() - DECISION_DEDUP_MS);
    const subjectType: RiskSubjectType = input.contactId ? "CONTACT" : input.companyId ? "COMPANY" : "ORDER";
    const subjectId = input.contactId ?? input.companyId ?? input.orderId;
    if (!subjectId) return null;

    if (input.orderId) {
      const byOrder = await this.prisma.riskDecision.findFirst({
        where: {
          orderId: input.orderId,
          gatePoint: "ORDER_DEFERRED",
          outcome: "REQUIRE_APPROVAL",
          approvedAt: null,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
      });
      if (byOrder) return byOrder;
    }

    return this.prisma.riskDecision.findFirst({
      where: {
        domain: "CLIENT_CREDIT",
        gatePoint: "ORDER_DEFERRED",
        subjectType,
        subjectId,
        outcome: "REQUIRE_APPROVAL",
        approvedAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async hasSevereOverdue(
    contactId?: string | null,
    companyId?: string | null,
    blockOverdueDays = DEFAULT_CREDIT_POLICY.blockOverdueDays,
  ) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - blockOverdueDays);
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
