import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RiskExposureService } from "../risk-exposure.service";

describe("RiskExposureService", () => {
  it("excludes order debt from utilized when excludeOrderId is set", async () => {
    const prisma = {
      creditProfile: {
        findUnique: async () => ({
          id: "p1",
          creditLimit: 100_000,
          status: "ACTIVE",
        }),
      },
      order: {
        findMany: async () => [
          { id: "o1", debtAmount: 5000 },
          { id: "o2", debtAmount: 3000 },
        ],
      },
    };

    const svc = new RiskExposureService(prisma as never);
    const result = await svc.computeExposure({
      contactId: "c1",
      additionalAmount: 10_000,
      excludeOrderId: "o1",
      persist: false,
    });

    assert.equal(result.bookUtilized, 3000);
    assert.equal(result.utilizedExposure, 13_000);
    assert.equal(result.exposurePct, 13);
  });

  it("does not auto-create profile and uses limit 0 when profile missing", async () => {
    let created = false;
    const prisma = {
      creditProfile: {
        findUnique: async () => null,
        update: async () => {
          created = true;
        },
      },
      order: {
        findMany: async () => [{ id: "o1", debtAmount: 1000 }],
      },
    };

    const svc = new RiskExposureService(prisma as never);
    const result = await svc.computeExposure({
      contactId: "c1",
      additionalAmount: 500,
      persist: false,
    });

    assert.equal(created, false);
    assert.equal(result.profile, null);
    assert.equal(result.creditLimit, 0);
    assert.equal(result.exposurePct, 100);
  });

  it("persists only book utilized, not projected additional", async () => {
    let persisted: { utilizedExposure?: number; availableCredit?: number } | null = null;
    const prisma = {
      creditProfile: {
        findUnique: async () => ({
          id: "p1",
          creditLimit: 50_000,
          status: "ACTIVE",
        }),
        update: async (_args: { data: { utilizedExposure: number; availableCredit: number } }) => {
          persisted = _args.data;
        },
      },
      order: {
        findMany: async () => [{ id: "o1", debtAmount: 10_000 }],
      },
    };

    const svc = new RiskExposureService(prisma as never);
    await svc.computeExposure({
      contactId: "c1",
      additionalAmount: 20_000,
      persist: true,
    });

    assert.equal(persisted?.utilizedExposure, 10_000);
    assert.equal(persisted?.availableCredit, 40_000);
  });
});
