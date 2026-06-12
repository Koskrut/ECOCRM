import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  assertFinanciallyClosedForCompletion,
  getSyncCompletionBlockers,
  projectedFinancialStatusAtCompleted,
} from "../order-completion-guards";

describe("order-completion-guards", () => {
  it("projects CLOSED financial status at COMPLETED when debt is zero", () => {
    assert.equal(
      projectedFinancialStatusAtCompleted({
        paymentType: "DEFERRED",
        totalAmount: 1000,
        paidAmount: 1000,
        debtAmount: 0,
      }),
      "CLOSED",
    );
  });

  it("projects non-CLOSED financial status at COMPLETED when debt remains", () => {
    const status = projectedFinancialStatusAtCompleted({
      paymentType: "DEFERRED",
      totalAmount: 1000,
      paidAmount: 500,
      debtAmount: 500,
    });
    assert.notEqual(status, "CLOSED");
  });

  it("blocks completion when projected financial status is not CLOSED", () => {
    assert.throws(
      () =>
        assertFinanciallyClosedForCompletion({
          paymentType: "DEFERRED",
          totalAmount: 1000,
          paidAmount: 500,
          debtAmount: 500,
        }),
      BadRequestException,
    );
  });

  it("lists sync blockers for debt and financial status", () => {
    const blockers = getSyncCompletionBlockers({
      paymentType: "DEFERRED",
      totalAmount: 1000,
      paidAmount: 400,
      debtAmount: 600,
    });
    assert.ok(blockers.some((b) => b.startsWith("open_debt:")));
    assert.ok(blockers.some((b) => b.startsWith("financial_status:")));
  });
});
