import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsOptional, Min } from "class-validator";

export class RingostatWeeklyRunDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

