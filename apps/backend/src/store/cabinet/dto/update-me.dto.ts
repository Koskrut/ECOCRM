import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string | null;
}
