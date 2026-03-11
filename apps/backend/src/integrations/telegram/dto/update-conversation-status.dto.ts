import { ConversationStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateConversationStatusDto {
  @IsEnum(ConversationStatus)
  status!: ConversationStatus;
}
