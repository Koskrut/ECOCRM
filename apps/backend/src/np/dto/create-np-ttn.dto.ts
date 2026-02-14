import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export enum NpRecipientType {
  PERSON = "PERSON",
  COMPANY = "COMPANY",
}

export enum NpDeliveryType {
  WAREHOUSE = "WAREHOUSE",
  POSTOMAT = "POSTOMAT",
  ADDRESS = "ADDRESS",
}

export class NpParcelDto {
  @IsNumber()
  @Min(0.01)
  weight!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;
}

export class NpTtnShippedItemDto {
  @IsNotEmpty()
  @IsString()
  orderItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qtyShipped!: number;
}

export class CreateNpTtnDraftDto {
  @IsEnum(NpRecipientType)
  recipientType!: NpRecipientType;

  @IsEnum(NpDeliveryType)
  deliveryType!: NpDeliveryType;

  @IsOptional()
  @IsString()
  label?: string;

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

  // City
  @IsNotEmpty()
  @IsString()
  cityRef!: string;

  @IsOptional()
  @IsString()
  cityName?: string;

  // Warehouse/Postomat
  @IsOptional()
  @IsString()
  warehouseRef?: string;

  @IsOptional()
  @IsString()
  warehouseNumber?: string;

  @IsOptional()
  @IsString()
  warehouseType?: string;

  // Address delivery
  @IsOptional()
  @IsString()
  streetRef?: string;

  @IsOptional()
  @IsString()
  streetName?: string;

  @IsOptional()
  @IsString()
  building?: string;

  @IsOptional()
  @IsString()
  flat?: string;
}

export class CreateNpTtnDto {
  @IsOptional()
  @IsString()
  profileId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateNpTtnDraftDto)
  draft?: CreateNpTtnDraftDto;

  @IsOptional()
  @IsBoolean()
  saveAsProfile?: boolean;

  @IsOptional()
  @IsString()
  profileLabel?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  seatsAmount?: number;

  // ✅ добавили (используется в сервисе)
  @IsOptional()
  @IsString()
  payerType?: string; // Recipient/Sender/ThirdPerson

  // ✅ добавили (используется в сервисе)
  @IsOptional()
  @IsString()
  paymentMethod?: string; // Cash/NonCash

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NpParcelDto)
  parcels?: NpParcelDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NpTtnShippedItemDto)
  shippedItems?: NpTtnShippedItemDto[];
}
