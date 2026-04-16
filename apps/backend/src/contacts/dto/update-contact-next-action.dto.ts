import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export const CONTACT_NEXT_ACTION_TYPES = [
  "CALL",
  "MESSAGE",
  "SEND_OFFER",
  "CONTROL_PAYMENT",
  "MEETING",
  "NO_ACTION",
] as const;

export type ContactNextActionType = (typeof CONTACT_NEXT_ACTION_TYPES)[number];

export class UpdateContactNextActionDto {
  @IsOptional()
  @IsString()
  @IsIn(CONTACT_NEXT_ACTION_TYPES)
  nextActionType?: ContactNextActionType | null;

  @IsOptional()
  @IsDateString()
  nextActionAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextActionNote?: string | null;
}
