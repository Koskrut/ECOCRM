import { IsBoolean, IsDateString, IsOptional } from "class-validator";

export class RingostatLeadsRetrofitDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

