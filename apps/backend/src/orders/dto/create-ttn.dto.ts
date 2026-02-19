import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { NpDeliveryType, NpRecipientType } from "@prisma/client";

export class CreateProfileDto {
  @IsOptional()
  @IsBoolean()
  saveToContact?: boolean;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsIn(["PERSON", "COMPANY"])
  recipientType!: NpRecipientType;

  @IsIn(["WAREHOUSE", "POSTOMAT", "ADDRESS"])
  deliveryType!: NpDeliveryType;

  // PERSON
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() phone?: string;

  // COMPANY
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() edrpou?: string;
  @IsOptional() @IsString() contactPersonFirstName?: string;
  @IsOptional() @IsString() contactPersonLastName?: string;
  @IsOptional() @IsString() contactPersonMiddleName?: string;
  @IsOptional() @IsString() contactPersonPhone?: string;

  // city
  @IsOptional() @IsString() cityRef?: string;
  @IsOptional() @IsString() cityName?: string;

  // warehouse / postomat
  @IsOptional() @IsString() warehouseRef?: string;
  @IsOptional() @IsString() warehouseNumber?: string;
  @IsOptional() @IsString() warehouseType?: string;

  // address
  @IsOptional() @IsString() streetRef?: string;
  @IsOptional() @IsString() streetName?: string;
  @IsOptional() @IsString() building?: string;
  @IsOptional() @IsString() flat?: string;
}

export class CreateTtnDto {
  @IsIn(["NOVA_POSHTA"])
  carrier!: "NOVA_POSHTA";

  @IsOptional()
  @IsString()
  profileId?: string;

  @IsOptional()
  createProfile?: CreateProfileDto;
}
