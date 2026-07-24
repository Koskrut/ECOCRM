-- AlterEnum: terminal outcome for fully returned orders (qty coverage FULL after all returns CLOSED).
ALTER TYPE "OrderStage" ADD VALUE IF NOT EXISTS 'FULLY_RETURNED';

-- Seed pipeline row (must stay in sync with order-pipeline.defaults.ts).
INSERT INTO "OrderPipelineStage" ("stage", "sortOrder", "label", "color", "kanbanGroup", "allowedNext") VALUES
('FULLY_RETURNED', 12, 'Повернений', 'border-amber-400 bg-amber-50/80', 'FINAL', '[]'::jsonb)
ON CONFLICT ("stage") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "label" = EXCLUDED."label",
  "color" = EXCLUDED."color",
  "kanbanGroup" = EXCLUDED."kanbanGroup",
  "allowedNext" = EXCLUDED."allowedNext";
