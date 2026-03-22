import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { OutboundTargetType } from "@prisma/client";

export class CreateOutboundCampaignDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEnum(OutboundTargetType)
  targetType!: OutboundTargetType;

  @IsString()
  @MaxLength(80)
  scenarioCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  scenarioVersion?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
