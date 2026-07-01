import { IsString } from "class-validator";

export class MetaLinkContactDto {
  @IsString()
  contactId!: string;
}
