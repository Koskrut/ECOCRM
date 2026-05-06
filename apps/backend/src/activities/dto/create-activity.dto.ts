import { ActivityType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const ACTIVITY_TITLE_MAX = 200;
export const ACTIVITY_BODY_MAX = 10_000;

export class CreateActivityDto {
  @IsEnum(ActivityType, { message: "type must be one of ActivityType values" })
  type!: ActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_TITLE_MAX)
  title?: string | null;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "body is required" })
  @MaxLength(ACTIVITY_BODY_MAX)
  body!: string;

  @IsOptional()
  @IsISO8601({ strict: false }, { message: "occurredAt must be a valid ISO date" })
  occurredAt?: string;
}
