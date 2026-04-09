import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { LeadPipelineStage } from "@prisma/client";
import { LeadsPipelineConfigService } from "../leads-pipeline-config.service";
import { buildDefaultPipelineRows, buildFullAllowedTransitions } from "../lead-pipeline.defaults";

function rowFromDefault(
  r: ReturnType<typeof buildDefaultPipelineRows>[number],
): LeadPipelineStage {
  return {
    status: r.status,
    sortOrder: r.sortOrder,
    label: r.label,
    color: r.color,
    visible: r.visible,
    allowedNext: r.allowedNext,
    uiStepKey: r.uiStepKey,
  };
}

describe("LeadsPipelineConfigService", () => {
  it("uses DB rows when valid", async () => {
    const defaults = buildDefaultPipelineRows();
    const findMany = mock.fn(async () => defaults.map(rowFromDefault));
    const prisma = { leadPipelineStage: { findMany } } as ConstructorParameters<typeof LeadsPipelineConfigService>[0];
    const svc = new LeadsPipelineConfigService(prisma);
    const api = await svc.getPipelineForApi();
    assert.equal(api.stages.length, 6);
    assert.equal(api.uiSteps.length, 3);
    assert.equal(api.uiSteps[0]?.key, "NEW");
    assert.equal(api.uiSteps[0]?.label, "Новий");
    assert.ok(api.uiSteps[2]?.memberStatuses.includes("WON"));
  });

  it("falls back when row count wrong", async () => {
    const findMany = mock.fn(async () => [] as LeadPipelineStage[]);
    const prisma = { leadPipelineStage: { findMany } } as ConstructorParameters<typeof LeadsPipelineConfigService>[0];
    const svc = new LeadsPipelineConfigService(prisma);
    const g = await svc.getEffectiveTransitionGraph();
    const full = buildFullAllowedTransitions();
    assert.deepEqual(g, full);
    const api = await svc.getPipelineForApi();
    assert.equal(api.stages.length, 6);
  });
});
