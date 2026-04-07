import { IsBoolean, IsISO8601, IsInt, IsOptional, Max, Min } from "class-validator";

export class RingostatRekeyUniqueidDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  limit?: number;
}

