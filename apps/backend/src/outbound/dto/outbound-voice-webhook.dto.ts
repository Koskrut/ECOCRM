import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class OutboundVoiceWebhookDto {
  @IsString()
  @MaxLength(200)
  providerSessionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryId?: string;

  @IsOptional()
  @IsString()
  outcomeKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  summary?: string;

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  /** Telephony row id to link OutboundCallAttempt.callId to existing Call (provider + externalId). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalCallId?: string;

  /** Defaults to RINGOSTAT when linking Call. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  callProvider?: string;
}
