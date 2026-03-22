import { describe, it } from "node:test";
import assert from "node:assert";
import { OutboundPostCallAnalysisService } from "../outbound-post-call-analysis.service";
import { ScenarioRegistryService } from "../scenarios/scenario-registry.service";
import type { SettingsService } from "../../settings/settings.service";

describe("OutboundPostCallAnalysisService", () => {
  it("returns NO_ANSWER fallback when OpenAI key is missing", async () => {
    const settings = {
      getTelegramAiConfig: async () => ({
        enabled: false,
        openaiApiKey: null,
        model: "gpt-4o-mini",
      }),
    } as unknown as SettingsService;
    const scenarios = new ScenarioRegistryService();
    const svc = new OutboundPostCallAnalysisService(settings, scenarios);
    const scenario = scenarios.getLatest("LEAD_QUALIFICATION");
    const r = await svc.analyzeFromTranscript({
      scenario,
      transcript: "Клієнт сказав що зацікавлений",
    });
    assert.strictEqual(r.outcomeKey, "NO_ANSWER");
    assert.ok(r.summary.length > 0);
    assert.deepStrictEqual(r.fields, {});
    assert.strictEqual(r.usedFallbackOutcome, true);
    assert.strictEqual(r.aiConfidence, null);
  });
});
