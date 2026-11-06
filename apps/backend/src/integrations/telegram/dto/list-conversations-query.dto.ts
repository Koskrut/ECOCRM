import { ConversationChannel, ConversationStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const CONVERSATION_LIST_SCOPES = ["mine", "unassigned", "all"] as const;
export type ConversationListScope = (typeof CONVERSATION_LIST_SCOPES)[number];

export class ListConversationsQueryDto {
  @IsOptional()
  @IsEnum(ConversationChannel)
  channel?: ConversationChannel;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsString()
  assignedTo?: string; // "me" or userId

  /** mine = assignee or collaborator, unassigned = pool, all = everything visibility allows. */
  @IsOptional()
  @IsIn(CONVERSATION_LIST_SCOPES)
  scope?: ConversationListScope;

  /** Name, phone, @username, or display label. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  unread?: boolean;

  /** Last human message (not bot, not an internal note) is inbound. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  waiting?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  hideNoise?: boolean;

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
