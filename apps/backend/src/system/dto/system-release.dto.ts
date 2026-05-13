/** Release / update visibility for GET /system/release (env-backed; no runtime execution). */
export type SystemUpdateVisibilityDto = {
  mode: "operator_only" | "agent_available";
  state: "idle" | "up_to_date" | "update_available" | "updating" | "failed";
  message: string;
  canUpdate: boolean;
  reason: string;
};

export type SystemReleaseDto = {
  version: string | null;
  gitSha: string | null;
  builtAt: string | null;
  imageTag: string | null;
  update: SystemUpdateVisibilityDto;
};
