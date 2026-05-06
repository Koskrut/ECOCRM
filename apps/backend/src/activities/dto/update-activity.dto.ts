import { IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";
import { ACTIVITY_BODY_MAX, ACTIVITY_TITLE_MAX } from "./create-activity.dto";

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_BODY_MAX)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_TITLE_MAX)
  title?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null && value !== "")
  @IsString({ message: "pinnedAt must be ISO date string or null" })
  pinnedAt?: string | null;
}
