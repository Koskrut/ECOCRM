import { IsIn, IsInt, IsString, Max, Min } from "class-validator";

export class AttachMediaDto {
  @IsString()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsIn(["alaw", "mulaw"])
  codec!: "alaw" | "mulaw";
}
