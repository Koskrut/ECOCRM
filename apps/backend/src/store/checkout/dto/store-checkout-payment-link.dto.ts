import { IsString, MinLength } from "class-validator";

export class StoreCheckoutPaymentLinkDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
