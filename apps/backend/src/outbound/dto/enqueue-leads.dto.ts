import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class EnqueueLeadsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  leadIds!: string[];
}
