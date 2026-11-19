import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateMetaAudiencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  adAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  accessToken?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  lapsedDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  seedWindowDays?: number;
}
