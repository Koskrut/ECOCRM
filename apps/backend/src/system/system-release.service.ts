import { Injectable } from "@nestjs/common";
import type { SystemReleaseDto } from "./dto/system-release.dto";

function trimOrNull(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

@Injectable()
export class SystemReleaseService {
  getRelease(): SystemReleaseDto {
    return {
      version: trimOrNull(process.env.CRM_RELEASE_VERSION),
      gitSha: trimOrNull(process.env.GIT_SHA),
      builtAt: trimOrNull(process.env.BUILD_TIME),
      imageTag: trimOrNull(process.env.IMAGE_TAG),
      update: {
        mode: "operator_only",
        state: "idle",
        message: "Updates are performed manually by the server operator.",
      },
    };
  }
}
