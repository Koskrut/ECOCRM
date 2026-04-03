import { IsDateString } from "class-validator";

export class RingostatBackfillDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
