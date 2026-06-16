import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PaymentSourceType, PaymentStatus } from "@prisma/client";
import { computeFxVarianceSnapshot } from "../fx-variance.utils";

const bankUah = (amount: number) => ({
  amount,
  currency: "UAH",
  status: PaymentStatus.COMPLETED,
  sourceType: PaymentSourceType.BANK,
});

describe("fx-variance.utils", () => {
  it("detects candidate when UAH matches but USD debt is small", () => {
    const snap = computeFxVarianceSnapshot(
      {
        currency: "USD",
        exchangeRate: 41,
        totalAmount: 100,
        returnAdjustmentAmount: 0,
        paidAmount: 99.27,
        debtAmount: 0.73,
        fxWriteOffAmount: 0,
        orderStage: "RECEIVED",
        openReturnCount: 0,
      },
      [bankUah(4100)],
    );
    assert.equal(snap.isCandidate, true);
    assert.ok(Math.abs(snap.residualUah) <= 50);
    assert.ok(Math.abs(snap.suggestedWriteOffUsd - 0.73) < 0.01);
    assert.equal(snap.canAutoComplete, true);
  });

  it("rejects when UAH underpaid (real debt)", () => {
    const snap = computeFxVarianceSnapshot(
      {
        currency: "USD",
        exchangeRate: 41,
        totalAmount: 100,
        paidAmount: 95.12,
        debtAmount: 4.88,
        orderStage: "RECEIVED",
      },
      [bankUah(3900)],
    );
    assert.equal(snap.isCandidate, false);
  });

  it("rejects when debt exceeds max write-off", () => {
    const snap = computeFxVarianceSnapshot(
      {
        currency: "USD",
        exchangeRate: 41,
        totalAmount: 100,
        paidAmount: 97,
        debtAmount: 3,
        orderStage: "RECEIVED",
      },
      [bankUah(4100)],
    );
    assert.equal(snap.isCandidate, false);
  });

  it("rejects without completed bank/cash payment", () => {
    const snap = computeFxVarianceSnapshot(
      {
        currency: "USD",
        exchangeRate: 41,
        totalAmount: 100,
        paidAmount: 99.5,
        debtAmount: 0.5,
        orderStage: "RECEIVED",
      },
      [],
    );
    assert.equal(snap.isCandidate, false);
  });

  it("canAutoComplete false when open returns", () => {
    const snap = computeFxVarianceSnapshot(
      {
        currency: "USD",
        exchangeRate: 41,
        totalAmount: 100,
        paidAmount: 99.5,
        debtAmount: 0.5,
        orderStage: "RECEIVED",
        openReturnCount: 1,
      },
      [bankUah(4100)],
    );
    assert.equal(snap.isCandidate, true);
    assert.equal(snap.canAutoComplete, false);
  });
});
