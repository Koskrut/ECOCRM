/** Admin-visible Control Plane / phone-home telemetry (no secrets). */
export type SystemControlPlaneDto = {
  controlPlaneMode: boolean;
  installationId: string | null;
  controlPlaneUrlConfigured: boolean;
  tokenConfigured: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastHttpStatus: number | null;
  lastError: string | null;
};
