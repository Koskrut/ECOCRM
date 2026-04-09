-- CreateEnum
CREATE TYPE "OrderKanbanGroup" AS ENUM ('MAIN', 'FINAL');

-- CreateTable
CREATE TABLE "OrderPipelineStage" (
    "stage" "OrderStage" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "kanbanGroup" "OrderKanbanGroup" NOT NULL,
    "allowedNext" JSONB NOT NULL,

    CONSTRAINT "OrderPipelineStage_pkey" PRIMARY KEY ("stage")
);

-- Default pipeline — must stay in sync with apps/backend/src/orders/pipeline/order-pipeline.defaults.ts
INSERT INTO "OrderPipelineStage" ("stage", "sortOrder", "label", "color", "kanbanGroup", "allowedNext") VALUES
('NEW', 0, 'Новий', NULL, 'MAIN', '["AWAITING_PAYMENT","AWAITING_STOCK","CANCELED"]'::jsonb),
('AWAITING_PAYMENT', 1, 'Очікує оплату', NULL, 'MAIN', '["AWAITING_STOCK","NEW","CANCELED"]'::jsonb),
('AWAITING_STOCK', 2, 'Очікує на склад', NULL, 'MAIN', '["CONFIRMED","NEW","CANCELED"]'::jsonb),
('CONFIRMED', 3, 'Підтверджено', NULL, 'MAIN', '["READY_TO_SHIP","AWAITING_STOCK","CANCELED","NEW"]'::jsonb),
('READY_TO_SHIP', 4, 'Готово до відправки', NULL, 'MAIN', '["SHIPPED","CONFIRMED","CANCELED"]'::jsonb),
('SHIPPED', 5, 'Відправлено', NULL, 'MAIN', '["AWAITING_RECEIPT","REFUSED"]'::jsonb),
('AWAITING_RECEIPT', 6, 'Очікує отримання', NULL, 'MAIN', '["RECEIVED","REFUSED"]'::jsonb),
('RECEIVED', 7, 'Отримано', NULL, 'MAIN', '["COMPLETED","RETURN_IN_PROGRESS"]'::jsonb),
('COMPLETED', 8, 'Завершено', 'border-emerald-300 bg-emerald-50/80', 'FINAL', '["RETURN_IN_PROGRESS"]'::jsonb),
('CANCELED', 9, 'Скасовано', 'border-red-300 bg-red-50/80', 'FINAL', '["NEW"]'::jsonb),
('REFUSED', 10, 'Відмова', 'border-orange-300 bg-orange-50/80', 'FINAL', '[]'::jsonb),
('RETURN_IN_PROGRESS', 11, 'Повернення', 'border-amber-300 bg-amber-50/80', 'FINAL', '[]'::jsonb)
ON CONFLICT ("stage") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "label" = EXCLUDED."label",
  "color" = EXCLUDED."color",
  "kanbanGroup" = EXCLUDED."kanbanGroup",
  "allowedNext" = EXCLUDED."allowedNext";
