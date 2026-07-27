import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RiskScorecardService } from "../risk-scorecard.service";

describe("RiskScorecardService", () => {
  const svc = new RiskScorecardService();

  it("scores overdue debt signals as HIGH", () => {
    const results = svc.scoreFromSignals([
      {
        domain: "CLIENT_CREDIT",
        signalCode: "DEBT_AGED_30",
        severity: "CRITICAL",
        subjectType: "CONTACT",
        subjectId: "c1",
      },
    ]);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.band, "HIGH");
    assert.ok(results[0]!.score >= 60);
  });

  it("computes credit exposure band as HIGH at 100%", () => {
    const result = svc.scoreCreditExposure({
      exposurePct: 100,
      blocked: false,
      subjectType: "CONTACT",
      subjectId: "c1",
    });
    assert.equal(result.band, "HIGH");
  });
});
