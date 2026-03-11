import { IsOptional, IsString, MinLength } from "class-validator";

export class StoreRegisterDto {
  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters" })
  password!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  email?: string;
}
