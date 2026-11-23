import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExchangeRates } from "../../settings/settings.service";
import {
  accruePayrollMonth,
  computeLeadTeamBonusUsd,
  computeSalesBonusUsd,
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
  thresholdUsd: 25000,
  percentUpTo: 2,
  percentAbove: 2.5,
  leadTeamBonusPercent: 1,
};

function order(partial: Partial<PayrollOrderInput> & Pick<PayrollOrderInput, "id" | "payments">): PayrollOrderInput {
  return {
    orderNumber: partial.orderNumber ?? partial.id,
    ownerId: partial.ownerId ?? "u1",
    currency: partial.currency ?? "USD",
    totalAmount: partial.totalAmount ?? 10000,
    returnAdjustmentAmount: partial.returnAdjustmentAmount ?? 0,
    fxWriteOffAmount: partial.fxWriteOffAmount ?? 0,
    exchangeRate: partial.exchangeRate ?? 40,
    orderStage: partial.orderStage ?? "COMPLETED",
    ...partial,
  };
}

describe("computeSalesBonusUsd cliff", () => {
  it("applies 2% to whole month when at or below threshold", () => {
    const r = resolveBonusRates(company, {
      bonusThresholdUsd: null,
      bonusPercentUpTo: null,
      bonusPercentAbove: null,
    });
    assert.deepEqual(computeSalesBonusUsd(20000, r), { appliedPercent: 2, bonusUsd: 400 });
    assert.deepEqual(computeSalesBonusUsd(25000, r), { appliedPercent: 2, bonusUsd: 500 });
  });

  it("applies 2.5% to whole month when above threshold", () => {
    const r = resolveBonusRates(company, {
      bonusThresholdUsd: null,
      bonusPercentUpTo: null,
      bonusPercentAbove: null,
    });
    assert.deepEqual(computeSalesBonusUsd(30000, r), { appliedPercent: 2.5, bonusUsd: 750 });
  });

  it("uses personal threshold and percents", () => {
    const r = resolveBonusRates(company, {
      bonusThresholdUsd: 10000,
      bonusPercentUpTo: 3,
      bonusPercentAbove: 4,
    });
    assert.equal(r.source, "personal");
    assert.deepEqual(computeSalesBonusUsd(12000, r), { appliedPercent: 4, bonusUsd: 480 });
  });
});

describe("findOrderClosePayment", () => {
  it("ignores partial payments that do not close debt", () => {
    const o = order({
      id: "o1",
      currency: "UAH",
      exchangeRate: null,
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
      currency: "UAH",
      exchangeRate: null,
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
        currency: "UAH",
        exchangeRate: null,
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
      currency: "UAH",
      exchangeRate: null,
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
        bonusThresholdUsd: null,
        bonusPercentUpTo: null,
        bonusPercentAbove: null,
      }).ok,
      true,
    );
    assert.equal(
      validatePersonalBonusTriplet({
        bonusThresholdUsd: 10000,
        bonusPercentUpTo: 3,
        bonusPercentAbove: 4,
      }).ok,
      true,
    );
  });

  it("rejects partial triplet", () => {
    assert.equal(
      validatePersonalBonusTriplet({
        bonusThresholdUsd: 10000,
        bonusPercentUpTo: null,
        bonusPercentAbove: 4,
      }).ok,
      false,
    );
  });
});

describe("computeLeadTeamBonusUsd", () => {
  it("applies flat percent to managers sales base", () => {
    assert.equal(computeLeadTeamBonusUsd(100000, 1), 1000);
    assert.equal(computeLeadTeamBonusUsd(0, 1), 0);
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
        bonusThresholdUsd: null,
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
              currency: "USD",
              amountUsd: 20000,
              paidAt: new Date("2026-11-10T12:00:00Z"),
              status: "COMPLETED",
            },
          ],
        }),
      ],
      fuelDays: [],
      teamSalesBaseUsd: 80000,
    });
    assert.equal(result.bonusUsd, 400);
    assert.equal(result.leadTeamBonusUsd, 800);
    // 1 USD = 40 UAH at test rates
    assert.equal(result.bonusUah, 16000);
    assert.equal(result.leadTeamBonusUah, 32000);
    assert.equal(result.totalUah, 48000);
  });

  it("includes only orders closed in the month and applies cliff bonus", () => {
    const result = accruePayrollMonth({
      month: "2026-11",
      companyRates: company,
      personal: {
        baseSalaryUah: 1000,
        amortizationUahPerKm: 2,
        bonusThresholdUsd: null,
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
              currency: "USD",
              amountUsd: 30000,
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
              currency: "USD",
              amountUsd: 5000,
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
    assert.equal(result.salesBaseUsd, 30000);
    assert.equal(result.appliedPercent, 2.5);
    assert.equal(result.bonusUsd, 750);
    assert.equal(result.bonusUah, 30000); // 750 USD × 40
    assert.equal(result.totalKm, 10);
    assert.equal(result.amortizationUah, 20);
    assert.equal(result.fuelCompensationUah, 350);
    assert.equal(result.baseSalaryUah, 1000);
    assert.equal(result.leadTeamBonusUsd, 0);
    assert.equal(result.totalUah, 31020);
  });
});
