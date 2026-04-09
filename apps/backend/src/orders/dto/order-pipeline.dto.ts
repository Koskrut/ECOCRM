import type { OrderKanbanGroup, OrderStage } from "@prisma/client";

export type OrderPipelineStageResponseDto = {
  stage: OrderStage;
  sortOrder: number;
  label: string;
  color: string | null;
  kanbanGroup: OrderKanbanGroup;
  allowedNext: OrderStage[];
};

export type OrderPipelineResponseDto = {
  stages: OrderPipelineStageResponseDto[];
};
