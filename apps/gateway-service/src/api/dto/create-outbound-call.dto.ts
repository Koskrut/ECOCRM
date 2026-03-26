import { Type } from "class-transformer";
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class CallbackDto {
  @IsString()
  @MaxLength(2000)
  webhookUrl!: string;

  @IsString()
  @MaxLength(128)
  webhookSecretHeader!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  publicBaseUrl?: string;
}

export class CreateOutboundCallDto {
  @IsString()
  @MaxLength(100)
  attemptId!: string;

  @IsString()
  @MaxLength(100)
  campaignId!: string;

  @IsString()
  @MaxLength(100)
  scenarioCode!: string;

  @IsString()
  @MaxLength(50)
  scenarioVersion!: string;

  @IsString()
  @MaxLength(200)
  scenarioKey!: string;

  @IsString()
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNormalized?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  leadId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyId?: string | null;

  @IsObject()
  context!: Record<string, unknown>;

  @IsObject()
  crmContext!: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CallbackDto)
  callback?: CallbackDto;
}
