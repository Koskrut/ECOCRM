import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RiskScorecardService } from "../risk-scorecard.service";

describe("RiskScorecardService", () => {
  const svc = new RiskScorecardService();

  it("scores overdue debt signals", () => {
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
    assert.equal(results[0]!.band, "MEDIUM");
    assert.ok(results[0]!.score >= 40);
  });

  it("computes credit exposure band", () => {
    const result = svc.scoreCreditExposure({
      exposurePct: 100,
      blocked: false,
      subjectType: "CONTACT",
      subjectId: "c1",
    });
    assert.equal(result.band, "MEDIUM");
  });
});
