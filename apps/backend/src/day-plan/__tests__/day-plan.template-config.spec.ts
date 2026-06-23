import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterEnabledItems,
  mergeTemplateItems,
  resolveEffectiveTemplate,
  validateTemplateItems,
  validateThresholds,
} from "../day-plan.template-config";
import { DEFAULT_OFFICE_DAY_PLAN } from "../day-plan.templates";

describe("day-plan.template-config", () => {
  it("merges global then user override", () => {
    const result = resolveEffectiveTemplate({
      profile: "office",
      globalConfig: {
        office: { items: [{ key: "calls_outbound", target: 20, weight: 30 }] },
      },
      userOverride: {
        items: [{ key: "calls_outbound", target: 25 }],
      },
    });
    const calls = result.template.items.find((i) => i.key === "calls_outbound");
    assert.equal(calls?.target, 25);
    assert.equal(calls?.weight, 30);
  });

  it("excludes disabled items from effective template", () => {
    const merged = mergeTemplateItems(DEFAULT_OFFICE_DAY_PLAN.items, [
      { key: "orders_created", enabled: false },
    ]);
    const enabled = filterEnabledItems(merged);
    assert.equal(enabled.some((i) => i.key === "orders_created"), false);
  });

  it("validates weight sum equals 100", () => {
    const items = mergeTemplateItems(DEFAULT_OFFICE_DAY_PLAN.items, []);
    assert.doesNotThrow(() => validateTemplateItems("office", items));
  });

  it("rejects invalid thresholds", () => {
    assert.throws(() => validateThresholds({ green: 40, yellow: 50 }));
  });
});
