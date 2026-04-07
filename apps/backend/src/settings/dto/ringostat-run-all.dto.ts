import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsOptional, Max, Min } from "class-validator";

export class RingostatRunAllDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  chunkDays?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50000)
  limit?: number;
}

