import { IsIn, IsString, MinLength } from "class-validator";

export class KyivstarFmcOriginateDto {
  @IsString()
  @MinLength(3)
  destination!: string;
}

export class KyivstarFmcCallControlDto {
  @IsString()
  @MinLength(1)
  callControlId!: string;

  @IsIn(["clear"])
  action!: "clear";
}
