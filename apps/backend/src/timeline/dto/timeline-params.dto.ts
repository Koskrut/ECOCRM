import { IsEnum, IsString } from "class-validator";
import type { TimelineEntityType } from "../timeline.types";

const ENTITY_VALUES: readonly TimelineEntityType[] = ["contact", "lead", "company", "order"];

export class TimelineParamsDto {
  @IsEnum(ENTITY_VALUES, { message: "entityType must be one of contact|lead|company|order" })
  entityType!: TimelineEntityType;

  @IsString()
  entityId!: string;
}
