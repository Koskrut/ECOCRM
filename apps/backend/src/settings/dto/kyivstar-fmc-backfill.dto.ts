import { IsISO8601, IsString } from "class-validator";

export class KyivstarFmcBackfillDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}
