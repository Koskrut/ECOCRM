import { IsOptional, IsString, ValidateIf } from "class-validator";

export class EnqueueQueueItemDto {
  @ValidateIf((o) => !o.contactId)
  @IsString()
  leadId?: string;

  @ValidateIf((o) => !o.leadId)
  @IsString()
  contactId?: string;
}
