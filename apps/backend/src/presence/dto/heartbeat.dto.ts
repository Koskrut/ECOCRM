import { ClientPlatform } from "@prisma/client";
import { IsEnum, IsIn, IsNumber, IsOptional } from "class-validator";

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
}

export class EndPresenceDto {
  @IsOptional()
  @IsEnum(ClientPlatform)
  platform?: ClientPlatform;
}
