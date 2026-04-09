import { ArrayUnique, IsArray, IsIn, IsString } from "class-validator";
import { PILOT_EXTENSION_MODULE_IDS } from "../../modules/enabled/modules-enabled.constants";

const PILOT_IN = [...PILOT_EXTENSION_MODULE_IDS] as [string, ...string[]];

export class UpdateSystemModulesEnabledDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(PILOT_IN, { each: true })
  enabled!: string[];
}
