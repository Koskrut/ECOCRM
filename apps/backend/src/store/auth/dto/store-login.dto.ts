import { IsString, MinLength } from "class-validator";

export class StoreLoginDto {
  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
