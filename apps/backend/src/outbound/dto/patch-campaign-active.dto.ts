import { IsBoolean } from "class-validator";

export class PatchCampaignActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
