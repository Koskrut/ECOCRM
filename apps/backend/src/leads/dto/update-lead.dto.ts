import { IsOptional, IsString } from "class-validator";

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  companyName?: string | null;

  @IsOptional()
  @IsString()
  message?: string | null;

  @IsOptional()
  sourceMeta?: unknown;
}

