import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PaymentSourceType, PaymentStatus, UserRole } from "@prisma/client";
import { FxVarianceService } from "../fx-variance.service";

type AuditSvc = import("../../audit/audit.service").AuditService;
type IntegrationSvc = import("../../integration-ports/integration-ports.service").IntegrationPortsService;
type OrdersSvc = import("../orders.service").OrdersService;
type PrismaSvc = import("../../prisma/prisma.service").PrismaService;

const candidateOrder = {
  id: "o1",
  orderNumber: "ORD-1",
  ownerId: "mgr1",
  currency: "USD",
  exchangeRate: 41,
  totalAmount: 100,
  returnAdjustmentAmount: 0,
  paidAmount: 99.27,
  debtAmount: 0.73,
  fxWriteOffAmount: 0,
  orderStage: "RECEIVED",
  payments: [
    {
      amount: 4100,
      currency: "UAH",
      status: PaymentStatus.COMPLETED,
      sourceType: PaymentSourceType.BANK,
    },
  ],
  returns: [],
};

function makeService(overrides: {
  prisma?: Partial<PrismaSvc>;
  integrations?: Partial<IntegrationSvc>;
  orders?: Partial<OrdersSvc>;
  audit?: Partial<AuditSvc>;
}) {
  const prisma = {
    order: {
      findMany: async () => [],
      findUnique: async () => null,
      update: async () => ({}),
    },
    ...overrides.prisma,
  } as unknown as PrismaSvc;
  const integrations = {
    recalcOrderFinance: async () => {},
    ...overrides.integrations,
  } as unknown as IntegrationSvc;
  const orders = {
    setOrderStage: async () => ({}),
    ...overrides.orders,
  } as unknown as OrdersSvc;
  const audit = {
    buildUpdatePayload: (p: unknown) => p,
    write: async () => ({}),
    ...overrides.audit,
  } as unknown as AuditSvc;
  return new FxVarianceService(prisma, integrations, orders, audit);
}

describe("FxVarianceService.writeOff", () => {
  it("writes off debt and auto-completes RECEIVED order", async () => {
    let updatedFx = 0;
    let stageSet = false;
    const svc = makeService({
      prisma: {
        order: {
          findMany: async () => [],
          findUnique: async ({ where }: { where: { id: string } }) => {
            if (where.id !== "o1") return null;
            return {
              ...candidateOrder,
              fxWriteOffAmount: updatedFx,
              debtAmount: updatedFx > 0 ? 0 : 0.73,
              orderStage: stageSet ? "COMPLETED" : "RECEIVED",
            };
          },
          update: async ({ data }: { data: { fxWriteOffAmount: number } }) => {
            updatedFx = data.fxWriteOffAmount;
            return {};
          },
        },
      },
      integrations: {
        recalcOrderFinance: async (orderId: string) => {
          assert.equal(orderId, "o1");
        },
      },
      orders: {
        setOrderStage: async (id: string, stage: string) => {
          assert.equal(id, "o1");
          assert.equal(stage, "COMPLETED");
          stageSet = true;
        },
      },
    });

    const res = await svc.writeOff(
      "o1",
      { note: "Курсова різниця", autoComplete: true },
      { id: "mgr1", role: UserRole.MANAGER, email: "m@test" },
    );
    assert.equal(res.ok, true);
    assert.ok(Math.abs(updatedFx - 0.73) < 0.01);
    assert.equal(stageSet, true);
  });

  it("rejects non-candidate order", async () => {
    const svc = makeService({
      prisma: {
        order: {
          findMany: async () => [],
          findUnique: async () => ({
            ...candidateOrder,
            debtAmount: 5,
            paidAmount: 95,
          }),
        },
      },
    });
    await assert.rejects(
      () =>
        svc.writeOff(
          "o1",
          { note: "Курсова різниця" },
          { id: "mgr1", role: UserRole.MANAGER, email: "m@test" },
        ),
      BadRequestException,
    );
  });

  it("rejects MANAGER on foreign order", async () => {
    const svc = makeService({
      prisma: {
        order: {
          findMany: async () => [],
          findUnique: async () => ({
            ...candidateOrder,
            ownerId: "other",
          }),
        },
      },
    });
    await assert.rejects(
      () =>
        svc.writeOff(
          "o1",
          { note: "Курсова різниця" },
          { id: "mgr1", role: UserRole.MANAGER, email: "m@test" },
        ),
      ForbiddenException,
    );
  });

  it("rejects repeat write-off when debt is zero", async () => {
    const svc = makeService({
      prisma: {
        order: {
          findMany: async () => [],
          findUnique: async () => ({
            ...candidateOrder,
            debtAmount: 0,
            paidAmount: 100,
            fxWriteOffAmount: 0.73,
          }),
        },
      },
    });
    await assert.rejects(
      () =>
        svc.writeOff(
          "o1",
          { note: "Повторне списання" },
          { id: "admin", role: UserRole.ADMIN, email: "a@test" },
        ),
      BadRequestException,
    );
  });
});
