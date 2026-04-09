-- CreateEnum
CREATE TYPE "LeadUiStepKey" AS ENUM ('NEW', 'IN_PROGRESS', 'PROCESSED');

-- CreateTable
CREATE TABLE "LeadPipelineStage" (
    "status" "LeadStatus" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "allowedNext" JSONB NOT NULL,
    "uiStepKey" "LeadUiStepKey" NOT NULL,

    CONSTRAINT "LeadPipelineStage_pkey" PRIMARY KEY ("status")
);

-- Default pipeline — keep in sync with apps/backend/src/leads/pipeline/lead-pipeline.defaults.ts
-- allowedNext: full graph (matches pre-config API: any LeadStatus -> any LeadStatus).
INSERT INTO "LeadPipelineStage" ("status", "sortOrder", "label", "color", "visible", "allowedNext", "uiStepKey") VALUES
('NEW', 0, 'Не обработан', NULL, true, '["NEW","IN_PROGRESS","WON","NOT_TARGET","LOST","SPAM"]'::jsonb, 'NEW'),
('IN_PROGRESS', 1, 'В работе', NULL, true, '["NEW","IN_PROGRESS","WON","NOT_TARGET","LOST","SPAM"]'::jsonb, 'IN_PROGRESS'),
('WON', 2, 'Успешный', NULL, true, '["NEW","IN_PROGRESS","WON","NOT_TARGET","LOST","SPAM"]'::jsonb, 'PROCESSED'),
('NOT_TARGET', 3, 'Нецелевой', NULL, true, '["NEW","IN_PROGRESS","WON","NOT_TARGET","LOST","SPAM"]'::jsonb, 'PROCESSED'),
('LOST', 4, 'Проваленный', NULL, true, '["NEW","IN_PROGRESS","WON","NOT_TARGET","LOST","SPAM"]'::jsonb, 'PROCESSED'),
('SPAM', 5, 'Спам', NULL, true, '["NEW","IN_PROGRESS","WON","NOT_TARGET","LOST","SPAM"]'::jsonb, 'PROCESSED')
ON CONFLICT ("status") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "label" = EXCLUDED."label",
  "color" = EXCLUDED."color",
  "visible" = EXCLUDED."visible",
  "allowedNext" = EXCLUDED."allowedNext",
  "uiStepKey" = EXCLUDED."uiStepKey";
