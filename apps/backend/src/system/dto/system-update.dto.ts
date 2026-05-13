export type UpdateMode = "operator_only" | "agent_available";

export type UpdateState =
  | "idle"
  | "up_to_date"
  | "update_available"
  | "preflight_failed"
  | "updating"
  | "failed";

export type UpdateJobStatus = "queued" | "running" | "succeeded" | "failed";

export type SystemUpdateStatusDto = {
  mode: UpdateMode;
  state: UpdateState;
  currentVersion: string | null;
  latestVersion: string | null;
  targetVersion: string | null;
  canUpdate: boolean;
  reason: string;
  cpReachable: boolean;
  updaterReachable: boolean;
  activeJobId: string | null;
  lastJobId: string | null;
};

export type SystemUpdateJobDto = {
  id: string;
  status: UpdateJobStatus;
  createdAt: string;
  updatedAt: string;
  requestedBy: string;
  fromVersion: string | null;
  toVersion: string | null;
  backupPath: string | null;
  message: string;
  logTail: string[];
};

export type SystemUpdatePreflightDto = {
  ok: boolean;
  message: string;
  details: Record<string, unknown>;
  suggestedVersion: string | null;
};

export type SystemUpdateApplyRequestDto = {
  targetVersion?: string;
};
