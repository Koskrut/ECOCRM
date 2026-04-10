/** Release / update visibility for GET /system/release (env-backed; no runtime execution). */
export type SystemUpdateVisibilityDto = {
  mode: "operator_only";
  state: "idle";
  message: string;
};

export type SystemReleaseDto = {
  version: string | null;
  gitSha: string | null;
  builtAt: string | null;
  imageTag: string | null;
  update: SystemUpdateVisibilityDto;
};
