import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateOutboundDto {
  @IsString()
  @MinLength(8)
  destination!: string;

  @IsString()
  externalSessionId!: string;

  @IsString()
  attemptId!: string;

  @IsOptional()
  correlation?: Record<string, unknown>;

  @IsOptional()
  sip?: Record<string, string>;
}
