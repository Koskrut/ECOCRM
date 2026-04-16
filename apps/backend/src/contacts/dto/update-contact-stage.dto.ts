import { IsIn, IsOptional, IsString } from "class-validator";

export const CONTACT_CLIENT_STAGES = [
  "NEW_LEAD",
  "IN_PROGRESS",
  "WAITING_DECISION",
  "ACTIVE_CLIENT",
  "DORMANT_CLIENT",
  "AT_RISK",
  "PROBLEM_DEBT",
  "LOST_CLIENT",
] as const;

export type ContactClientStage = (typeof CONTACT_CLIENT_STAGES)[number];

export class UpdateContactStageDto {
  @IsOptional()
  @IsString()
  @IsIn(CONTACT_CLIENT_STAGES)
  clientStage?: ContactClientStage | null;
}
