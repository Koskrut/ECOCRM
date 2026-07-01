import { ConversationChannel, ConversationStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const META_CHANNELS = [ConversationChannel.INSTAGRAM, ConversationChannel.FACEBOOK] as const;

export class ListMetaConversationsQueryDto {
  @IsEnum(ConversationChannel)
  @IsIn(META_CHANNELS)
  channel!: ConversationChannel;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;
}
