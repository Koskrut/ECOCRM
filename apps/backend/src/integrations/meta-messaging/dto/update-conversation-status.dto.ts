import { ConversationStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateMetaConversationStatusDto {
  @IsEnum(ConversationStatus)
  status!: ConversationStatus;
}
