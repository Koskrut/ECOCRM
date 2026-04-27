import { Injectable } from "@nestjs/common";
import { BUILT_AT, COMMIT_SHA, VERSION } from "../version";
import type { SystemVersionDto } from "./dto/system-version.dto";

@Injectable()
export class SystemVersionService {
  getVersion(): SystemVersionDto {
    return {
      version: VERSION,
      commitSha: COMMIT_SHA,
      builtAt: BUILT_AT,
      nodeEnv: process.env.NODE_ENV || "development",
    };
  }
}
