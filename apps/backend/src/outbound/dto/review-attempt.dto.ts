import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewAttemptDto {
  @IsOptional()
  @IsBoolean()
  markReviewed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  overrideOutcomeKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  managerNote?: string;
}
