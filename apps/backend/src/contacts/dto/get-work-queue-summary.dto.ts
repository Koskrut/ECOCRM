import { IsIn, IsOptional, IsString } from "class-validator";
import { CONTACT_WORK_QUEUE_PRESETS, type ContactWorkQueuePreset } from "./get-work-queue.dto";

export class GetWorkQueueSummaryDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsIn(CONTACT_WORK_QUEUE_PRESETS)
  preset?: ContactWorkQueuePreset;

  @IsOptional()
  @IsString()
  q?: string;
}
