import { DeliveryMethod, PaymentMethod, PaymentType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

const noProfile = (o: StoreDeliveryDataDto) => !o.profileId?.trim();
const personRecipient = (o: StoreDeliveryDataDto) => noProfile(o) && o.recipientType === "PERSON";
const companyRecipient = (o: StoreDeliveryDataDto) => noProfile(o) && o.recipientType === "COMPANY";
const warehouseOrPostomat = (o: StoreDeliveryDataDto) =>
  noProfile(o) && (o.deliveryType === "WAREHOUSE" || o.deliveryType === "POSTOMAT");
const addressDelivery = (o: StoreDeliveryDataDto) => noProfile(o) && o.deliveryType === "ADDRESS";

/** When NOVA_POSHTA: either profileId (existing profile) or new profile fields. */
export class StoreDeliveryDataDto {
  @IsOptional()
  @IsString()
  profileId?: string;

  @ValidateIf(noProfile)
  @IsString()
  @IsIn(["PERSON", "COMPANY"])
  recipientType?: "PERSON" | "COMPANY";

  @ValidateIf(noProfile)
  @IsString()
  @IsIn(["WAREHOUSE", "POSTOMAT", "ADDRESS"])
  deliveryType?: "WAREHOUSE" | "POSTOMAT" | "ADDRESS";

  @ValidateIf(noProfile)
  @IsString()
  @MinLength(1, { message: "Місто обов'язкове" })
  cityRef?: string;

  @IsOptional()
  @IsString()
  cityName?: string;

  @ValidateIf(warehouseOrPostomat)
  @IsString()
  @MinLength(1, { message: "Відділення/поштомат обов'язкове" })
  warehouseRef?: string;

  @IsOptional()
  @IsString()
  warehouseName?: string;

  @IsOptional()
  @IsString()
  warehouseNumber?: string;

  @IsOptional()
  @IsString()
  warehouseType?: string;

  @ValidateIf(addressDelivery)
  @IsString()
  @MinLength(1, { message: "Вулиця обов'язкова для доставки на адресу" })
  streetRef?: string;

  @IsOptional()
  @IsString()
  streetName?: string;

  @ValidateIf(addressDelivery)
  @IsString()
  @MinLength(1, { message: "Номер будинку обов'язковий" })
  building?: string;

  @IsOptional()
  @IsString()
  flat?: string;

  /** PERSON: ПІБ (або окремо firstName, lastName) */
  @ValidateIf(personRecipient)
  @IsString()
  @MinLength(1, { message: "ПІБ отримувача обов'язкове" })
  recipientName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @ValidateIf(personRecipient)
  @IsString()
  @MinLength(1, { message: "Телефон отримувача обов'язковий" })
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** COMPANY */
  @ValidateIf(companyRecipient)
  @IsString()
  @MinLength(1, { message: "Назва компанії обов'язкова" })
  companyName?: string;

  @ValidateIf(companyRecipient)
  @IsString()
  @MinLength(1, { message: "ЄДРПОУ обов'язковий" })
  edrpou?: string;

  @ValidateIf(companyRecipient)
  @IsString()
  @MinLength(1, { message: "Контактна особа обов'язкова" })
  contactPersonFirstName?: string;

  @ValidateIf(companyRecipient)
  @IsString()
  @MinLength(1)
  contactPersonLastName?: string;

  @IsOptional()
  @IsString()
  contactPersonMiddleName?: string;

  @ValidateIf(companyRecipient)
  @IsString()
  @MinLength(1, { message: "Телефон контактної особи обов'язковий" })
  contactPersonPhone?: string;

  @IsOptional()
  @IsBoolean()
  saveAsProfile?: boolean;

  @IsOptional()
  @IsString()
  profileLabel?: string;
}

export class StoreCheckoutDto {
  @IsString()
  @MinLength(1)
  phone!: string;

  /** Ім'я; приймаємо також name для сумісності з різними клієнтами */
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsEnum(DeliveryMethod)
  deliveryMethod!: DeliveryMethod;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StoreDeliveryDataDto)
  deliveryData?: StoreDeliveryDataDto | null;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
