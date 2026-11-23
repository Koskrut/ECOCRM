import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExchangeRates } from "../../settings/settings.service";
import {
  accruePayrollMonth,
  computeLeadTeamBonusUah,
  computeSalesBonusUah,
  findOrderClosePayment,
  resolveBonusRates,
  selectFuelKm,
  validatePersonalBonusTriplet,
  type PayrollOrderInput,
} from "../payroll-accrual.util";

const rates: ExchangeRates = {
  UAH_TO_USD: 1 / 40,
  UAH_TO_EUR: 1 / 42,
  EUR_TO_USD: 42 / 40,
  baseCurrency: "USD",
};

const company = {
  thresholdUah: 25000,
  percentUpTo: 2,
  percentAbove: 2.5,
  leadTeamBonusPercent: 1,
};

function order(partial: Partial<PayrollOrderInput> & Pick<PayrollOrderInput, "id" | "payments">): PayrollOrderInput {
  return {
    orderNumber: partial.orderNumber ?? partial.id,
    ownerId: partial.ownerId ?? "u1",
    currency: partial.currency ?? "UAH",
    totalAmount: partial.totalAmount ?? 10000,
    returnAdjustmentAmount: partial.returnAdjustmentAmount ?? 0,
    fxWriteOffAmount: partial.fxWriteOffAmount ?? 0,
    exchangeRate: partial.exchangeRate ?? null,
    orderStage: partial.orderStage ?? "COMPLETED",
    ...partial,
  };
}

describe("computeSalesBonusUah cliff", () => {
  it("applies 2% to whole month when at or below threshold", () => {
    const r = resolveBonusRates(company, {
      bonusThresholdUah: null,
      bonusPercentUpTo: null,
      bonusPercentAbove: null,
    });
    assert.deepEqual(computeSalesBonusUah(20000, r), { appliedPercent: 2, bonusUah: 400 });
    assert.deepEqual(computeSalesBonusUah(25000, r), { appliedPercent: 2, bonusUah: 500 });
  });

  it("applies 2.5% to whole month when above threshold", () => {
    const r = resolveBonusRates(company, {
      bonusThresholdUah: null,
      bonusPercentUpTo: null,
      bonusPercentAbove: null,
    });
    assert.deepEqual(computeSalesBonusUah(30000, r), { appliedPercent: 2.5, bonusUah: 750 });
  });

  it("uses personal threshold and percents", () => {
    const r = resolveBonusRates(company, {
      bonusThresholdUah: 10000,
      bonusPercentUpTo: 3,
      bonusPercentAbove: 4,
    });
    assert.equal(r.source, "personal");
    assert.deepEqual(computeSalesBonusUah(12000, r), { appliedPercent: 4, bonusUah: 480 });
  });
});

describe("findOrderClosePayment", () => {
  it("ignores partial payments that do not close debt", () => {
    const o = order({
      id: "o1",
      totalAmount: 10000,
      payments: [
        {
          amount: 4000,
          currency: "UAH",
          amountUsd: null,
          paidAt: new Date("2026-11-05T10:00:00Z"),
          status: "COMPLETED",
        },
      ],
    });
    assert.equal(findOrderClosePayment(o, rates), null);
  });

  it("uses the payment that first closes the debt as close date", () => {
    const o = order({
      id: "o2",
      totalAmount: 10000,
      payments: [
        {
          amount: 4000,
          currency: "UAH",
          amountUsd: null,
          paidAt: new Date("2026-11-05T10:00:00Z"),
          status: "COMPLETED",
        },
        {
          amount: 6000,
          currency: "UAH",
          amountUsd: null,
          paidAt: new Date("2026-11-20T10:00:00Z"),
          status: "COMPLETED",
        },
      ],
    });
    const closed = findOrderClosePayment(o, rates);
    assert.ok(closed);
    assert.equal(closed!.closedAt.toISOString(), "2026-11-20T10:00:00.000Z");
  });

  it("excludes canceled / refused / fully returned stages", () => {
    for (const stage of ["CANCELED", "REFUSED", "FULLY_RETURNED"] as const) {
      const o = order({
        id: "ox",
        orderStage: stage,
        totalAmount: 1000,
        payments: [
          {
            amount: 1000,
            currency: "UAH",
            amountUsd: null,
            paidAt: new Date("2026-11-01T10:00:00Z"),
            status: "COMPLETED",
          },
        ],
      });
      assert.equal(findOrderClosePayment(o, rates), null);
    }
  });

  it("negative CREDIT_TRANSFER prevents early close", () => {
    const o = order({
      id: "o3",
      totalAmount: 10000,
      payments: [
        {
          amount: 10000,
          currency: "UAH",
          amountUsd: null,
          paidAt: new Date("2026-11-01T10:00:00Z"),
          status: "COMPLETED",
        },
        {
          amount: -3000,
          currency: "UAH",
          amountUsd: null,
          paidAt: new Date("2026-11-02T10:00:00Z"),
          status: "COMPLETED",
        },
        {
          amount: 3000,
          currency: "UAH",
          amountUsd: null,
          paidAt: new Date("2026-11-15T10:00:00Z"),
          status: "COMPLETED",
        },
      ],
    });
    const closed = findOrderClosePayment(o, rates);
    assert.ok(closed);
    assert.equal(closed!.closedAt.toISOString(), "2026-11-15T10:00:00.000Z");
  });
});

describe("selectFuelKm", () => {
  it("skips REJECTED days", () => {
    assert.equal(
      selectFuelKm({
        date: new Date(),
        compensationKm: 50,
        actualKm: 50,
        amountEstimated: 200,
        compensationStatus: "REJECTED",
      }),
      0,
    );
  });

  it("prefers compensationKm over actualKm", () => {
    assert.equal(
      selectFuelKm({
        date: new Date(),
        compensationKm: 12,
        actualKm: 99,
        amountEstimated: null,
        compensationStatus: "APPROVED",
      }),
      12,
    );
  });
});

describe("validatePersonalBonusTriplet", () => {
  it("allows all null or all set", () => {
    assert.equal(
      validatePersonalBonusTriplet({
        bonusThresholdUah: null,
        bonusPercentUpTo: null,
        bonusPercentAbove: null,
      }).ok,
      true,
    );
    assert.equal(
      validatePersonalBonusTriplet({
        bonusThresholdUah: 10000,
        bonusPercentUpTo: 3,
        bonusPercentAbove: 4,
      }).ok,
      true,
    );
  });

  it("rejects partial triplet", () => {
    assert.equal(
      validatePersonalBonusTriplet({
        bonusThresholdUah: 10000,
        bonusPercentUpTo: null,
        bonusPercentAbove: 4,
      }).ok,
      false,
    );
  });
});

describe("computeLeadTeamBonusUah", () => {
  it("applies flat percent to managers sales base", () => {
    assert.equal(computeLeadTeamBonusUah(100000, 1), 1000);
    assert.equal(computeLeadTeamBonusUah(0, 1), 0);
  });
});

describe("accruePayrollMonth", () => {
  it("adds lead team bonus on top of own sales bonus", () => {
    const result = accruePayrollMonth({
      month: "2026-11",
      companyRates: company,
      personal: {
        baseSalaryUah: 0,
        amortizationUahPerKm: 0,
        bonusThresholdUah: null,
        bonusPercentUpTo: null,
        bonusPercentAbove: null,
      },
      rates,
      orders: [
        order({
          id: "own",
          totalAmount: 20000,
          payments: [
            {
              amount: 20000,
              currency: "UAH",
              amountUsd: null,
              paidAt: new Date("2026-11-10T12:00:00Z"),
              status: "COMPLETED",
            },
          ],
        }),
      ],
      fuelDays: [],
      teamSalesBaseUah: 80000,
    });
    assert.equal(result.bonusUah, 400);
    assert.equal(result.leadTeamBonusUah, 800);
    assert.equal(result.totalUah, 1200);
  });

  it("includes only orders closed in the month and applies cliff bonus", () => {
    const result = accruePayrollMonth({
      month: "2026-11",
      companyRates: company,
      personal: {
        baseSalaryUah: 1000,
        amortizationUahPerKm: 2,
        bonusThresholdUah: null,
        bonusPercentUpTo: null,
        bonusPercentAbove: null,
      },
      rates,
      orders: [
        order({
          id: "in",
          totalAmount: 30000,
          payments: [
            {
              amount: 30000,
              currency: "UAH",
              amountUsd: null,
              paidAt: new Date("2026-11-10T12:00:00Z"),
              status: "COMPLETED",
            },
          ],
        }),
        order({
          id: "out",
          totalAmount: 5000,
          payments: [
            {
              amount: 5000,
              currency: "UAH",
              amountUsd: null,
              paidAt: new Date("2026-10-10T12:00:00Z"),
              status: "COMPLETED",
            },
          ],
        }),
      ],
      fuelDays: [
        {
          date: new Date("2026-11-05T00:00:00Z"),
          compensationKm: 10,
          actualKm: 10,
          amountEstimated: 350,
          compensationStatus: "APPROVED",
        },
        {
          date: new Date("2026-11-06T00:00:00Z"),
          compensationKm: 5,
          actualKm: 5,
          amountEstimated: 100,
          compensationStatus: "REJECTED",
        },
      ],
    });

    assert.equal(result.orders.length, 1);
    assert.equal(result.salesBaseUah, 30000);
    assert.equal(result.appliedPercent, 2.5);
    assert.equal(result.bonusUah, 750);
    assert.equal(result.totalKm, 10);
    assert.equal(result.amortizationUah, 20);
    assert.equal(result.fuelCompensationUah, 350);
    assert.equal(result.baseSalaryUah, 1000);
    assert.equal(result.leadTeamBonusUah, 0);
    assert.equal(result.totalUah, 1770);
  });
});
