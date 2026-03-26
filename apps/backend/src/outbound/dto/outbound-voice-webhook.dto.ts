import { Type } from "class-transformer";
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

/** Optional correlation block from gateway (typed loosely for forward compatibility). */
export class OutboundVoiceCorrelationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalSessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerCallId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  openaiCallId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recordingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transcriptId?: string;
}

/**
 * Unified outbound voice webhook body: legacy completion (no eventType) or realtime envelope.
 * At least one of providerSessionId or attemptId should be present for lookup.
 */
export class OutboundVoiceWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  eventType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  attemptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerSessionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OutboundVoiceCorrelationDto)
  correlationIds?: OutboundVoiceCorrelationDto;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  outcomeKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
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

  @IsOptional()
  @IsString()
  @MaxLength(64)
  failureCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  failureReason?: string;
}
