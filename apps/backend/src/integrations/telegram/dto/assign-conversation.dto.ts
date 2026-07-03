import { IsOptional, IsString, ValidateIf } from "class-validator";

export class AssignConversationDto {
  /** User id to assign the conversation to, or null to unassign. */
  @ValidateIf((o) => o.userId !== null)
  @IsOptional()
  @IsString()
  userId!: string | null;
}
