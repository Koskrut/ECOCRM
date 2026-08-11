import { IsString } from "class-validator";

export class UpdateOrderReturnExternalCodeDto {
  @IsString()
  externalCode!: string;
}
