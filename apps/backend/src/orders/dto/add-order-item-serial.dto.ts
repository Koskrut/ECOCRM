import { IsString, MaxLength, MinLength } from "class-validator";
import { SERIAL_MAX_LENGTH } from "../order-item-serials";

export class AddOrderItemSerialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(SERIAL_MAX_LENGTH)
  serial!: string;
}
