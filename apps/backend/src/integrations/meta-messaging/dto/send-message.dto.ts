import { IsString, MinLength } from "class-validator";

export class SendMetaMessageDto {
  @IsString()
  @MinLength(1)
  text!: string;
}
