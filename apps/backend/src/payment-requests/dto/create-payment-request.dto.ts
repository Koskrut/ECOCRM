import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreatePaymentRequestDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MaxLength(140)
  purpose!: string;

  @IsDateString()
  expiresAt!: string;

  /** Необов'язковий текст для дисплею в QR (до 70 символів). */
  @IsOptional()
  @IsString()
  @MaxLength(70)
  displayText?: string;

  /** Вручну: ЄДРПОУ (8 цифр) або ІПН (10), якщо не знайдено в реквізитах рахунку/компанії. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  receiverCode?: string;
}
