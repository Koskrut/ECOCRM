import { ClientPlatform } from "@prisma/client";
import { IsEnum, IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class HeartbeatDto {
  @IsEnum(ClientPlatform)
  platform!: ClientPlatform;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsIn(["ACTIVE", "BACKGROUND", "INACTIVE"])
  appState?: string;

  @IsOptional()
  @IsIn(["background", "foreground", "none"])
  trackingMode?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  trackingSource?: string;
}

export class EndPresenceDto {
  @IsOptional()
  @IsEnum(ClientPlatform)
  platform?: ClientPlatform;
}
