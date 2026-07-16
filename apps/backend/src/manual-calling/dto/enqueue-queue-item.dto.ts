import { IsString, ValidateIf } from "class-validator";

export class EnqueueQueueItemDto {
  @ValidateIf((o) => !o.contactId && !o.companyId)
  @IsString()
  leadId?: string;

  @ValidateIf((o) => !o.leadId && !o.companyId)
  @IsString()
  contactId?: string;

  @ValidateIf((o) => !o.leadId && !o.contactId)
  @IsString()
  companyId?: string;
}
