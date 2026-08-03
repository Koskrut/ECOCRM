import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RiskPolicyService } from "../risk-policy.service";

function makePolicyService(deps: {
  exposure?: Partial<{
    computeExposure: RiskPolicyService["evaluateDeferredGate"] extends never ? never : CallableFunction;
  }>;
  prisma?: Record<string, unknown>;
}) {
  const exposure = {
    computeExposure: async () => ({
      exposurePct: 95,
      profile: { status: "ACTIVE" },
    }),
    ...deps.exposure,
  };
  const prisma = {
    riskPolicy: {
      findUnique: async () => null,
      upsert: async () => ({}),
      update: async () => ({}),
    },
    riskDecision: {
      findFirst: async () => null,
      create: async (args: { data: { id?: string } }) => ({ id: "dec-1", ...args.data }),
      update: async () => ({}),
      findUnique: async () => null,
    },
    order: { count: async () => 0 },
    ...deps.prisma,
  };
  const scorecard = {
    scoreCreditExposure: () => ({
      score: 65,
      band: "HIGH",
      reasons: [{ code: "EXPOSURE_CRITICAL", explanationUk: "test", explanationEn: "test", weight: 65, direction: "negative" }],
    }),
  };
  return new RiskPolicyService(exposure as never, scorecard as never, prisma as never);
}

describe("RiskPolicyService", () => {
  it("returns REQUIRE_APPROVAL above approve threshold", async () => {
    const svc = makePolicyService({});
    const result = await svc.evaluateDeferredGate({
      contactId: "c1",
      totalAmount: 10_000,
      paymentType: "DEFERRED",
      persistDecision: false,
    });
    assert.equal(result.outcome, "REQUIRE_APPROVAL");
  });

  it("does not persist decision when persistDecision is false", async () => {
    let created = false;
    const svc = makePolicyService({
      prisma: {
        riskDecision: {
          findFirst: async () => null,
          create: async () => {
            created = true;
            return { id: "dec-1" };
          },
        },
        riskPolicy: {
          findUnique: async () => null,
          upsert: async () => ({}),
        },
        order: { count: async () => 0 },
      },
    });
    await svc.evaluateDeferredGate({
      contactId: "c1",
      totalAmount: 10_000,
      paymentType: "DEFERRED",
      persistDecision: false,
    });
    assert.equal(created, false);
  });

  it("persists REQUIRE_APPROVAL decision when persistDecision is true", async () => {
    let created = false;
    const svc = makePolicyService({
      prisma: {
        riskDecision: {
          findFirst: async () => null,
          create: async () => {
            created = true;
            return { id: "dec-1" };
          },
        },
        riskPolicy: {
          findUnique: async () => null,
          upsert: async () => ({}),
        },
        order: { count: async () => 0 },
      },
    });
    const result = await svc.evaluateDeferredGate({
      contactId: "c1",
      totalAmount: 10_000,
      paymentType: "DEFERRED",
      persistDecision: true,
    });
    assert.equal(created, true);
    assert.equal(result.decisionId, "dec-1");
  });

  it("marks approvalSatisfied when approved decision covers amount", async () => {
    const svc = makePolicyService({
      prisma: {
        riskDecision: {
          findFirst: async () => ({
            id: "dec-approved",
            scoreSnapshot: { requestedAmount: 15_000 },
            approvedAt: new Date(),
            outcome: "ALLOW",
          }),
          create: async () => ({ id: "dec-1" }),
        },
        riskPolicy: {
          findUnique: async () => null,
          upsert: async () => ({}),
        },
        order: { count: async () => 0 },
      },
    });
    const result = await svc.evaluateDeferredGate({
      contactId: "c1",
      totalAmount: 10_000,
      paymentType: "DEFERRED",
      persistDecision: false,
    });
    assert.equal(result.outcome, "REQUIRE_APPROVAL");
    assert.equal(result.approvalSatisfied, true);
  });

  it("ship gate allows READY_TO_SHIP without TTN for pickup", async () => {
    const svc = makePolicyService({});
    const result = await svc.evaluateShipGate({
      orderId: "o1",
      hasTtn: false,
      orderStage: "READY_TO_SHIP",
      deliveryMethod: "PICKUP",
    });
    assert.equal(result.outcome, "ALLOW");
  });

  it("ship gate blocks READY_TO_SHIP without TTN for Nova Poshta", async () => {
    const svc = makePolicyService({});
    const result = await svc.evaluateShipGate({
      orderId: "o1",
      hasTtn: false,
      orderStage: "READY_TO_SHIP",
      deliveryMethod: "NOVA_POSHTA",
    });
    assert.equal(result.outcome, "BLOCK");
    assert.equal(result.reasons[0]?.code, "MISSING_TTN");
  });

  it("ship gate allows READY_TO_SHIP with TTN for Nova Poshta", async () => {
    const svc = makePolicyService({});
    const result = await svc.evaluateShipGate({
      orderId: "o1",
      hasTtn: true,
      orderStage: "READY_TO_SHIP",
      deliveryMethod: "NOVA_POSHTA",
    });
    assert.equal(result.outcome, "ALLOW");
  });
});
