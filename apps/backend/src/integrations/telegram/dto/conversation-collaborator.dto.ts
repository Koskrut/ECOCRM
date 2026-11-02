import { IsString, MinLength } from "class-validator";

export class ConversationCollaboratorDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
