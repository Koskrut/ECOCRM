import { IsIn, IsOptional, IsString } from "class-validator";
import { CONTACT_WORK_QUEUE_PRESETS, type ContactWorkQueuePreset } from "./get-work-queue.dto";

export class GetWorkQueueSummaryDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsIn(CONTACT_WORK_QUEUE_PRESETS)
  preset?: ContactWorkQueuePreset;

  /** `today`: due through end of today, skip contacts already touched today. */
  @IsOptional()
  @IsIn(["today"])
  horizon?: "today";

  @IsOptional()
  @IsString()
  q?: string;
}
