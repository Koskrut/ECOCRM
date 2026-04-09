import type { LeadStatus, LeadUiStepKey } from "@prisma/client";

export type LeadPipelineStageDto = {
  status: LeadStatus;
  sortOrder: number;
  label: string;
  color: string | null;
  visible: boolean;
  uiStepKey: LeadUiStepKey;
  allowedNext: LeadStatus[];
};

export type LeadPipelineUiStepDto = {
  key: LeadUiStepKey;
  label: string;
  color: "sky" | "amber" | "emerald";
  memberStatuses: LeadStatus[];
};

export type LeadPipelineConfigResponseDto = {
  stages: LeadPipelineStageDto[];
  uiSteps: LeadPipelineUiStepDto[];
};
