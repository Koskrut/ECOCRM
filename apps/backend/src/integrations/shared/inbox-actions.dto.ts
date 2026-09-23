import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCannedResponseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortcut?: string | null;

  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortcut?: string | null;

  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}

export class PinConversationDto {
  @IsBoolean()
  pinned!: boolean;
}

export class CreateInternalNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}
