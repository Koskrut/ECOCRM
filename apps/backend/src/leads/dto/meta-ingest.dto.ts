import { IsOptional, IsArray, IsString } from "class-validator";

/**
 * Meta Lead Ads webhook payload (root shape).
 * Full payload shape: { object?, entry?: Array<{ id?, time?, changes?: Array<{ value?, field? }> }> }
 * Validation is permissive so any webhook payload is accepted; parsing is done in service.
 */
export class MetaIngestDto {
  @IsOptional()
  @IsString()
  object?: string;

  @IsOptional()
  @IsArray()
  entry?: unknown[];
}
