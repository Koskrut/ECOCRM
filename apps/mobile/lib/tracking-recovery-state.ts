import AsyncStorage from "@react-native-async-storage/async-storage";

export type RecoveryStateKind =
  | "HEALTHY"
  | "ACCEPT_STALE"
  | "TASK_DEAD"
  | "RECOVERY_REQUIRED"
  | "RECOVERY_IN_PROGRESS"
  | "RECOVERED"
  | "RECOVERY_FAILED"
  | "ZOMBIE_FGS";

export type RecoveryReason = "ZOMBIE_FGS" | "TASK_DEAD" | "ACCEPT_STALE";

export type RecoveryEventKind =
  | "RESTART_REQUESTED"
  | "TASK_RECREATED"
  | "ACCEPT_RECEIVED"
  | "FIRST_LOCATION_RECEIVED"
  | "FIRST_POINT_UPLOADED"
  | "RECOVERY_CONFIRMED"
  | "RECOVERY_FAILED";

export type RecoveryPersistedState = {
  required: boolean;
  reason: RecoveryReason | null;
  state: RecoveryStateKind;
  recoveryAttemptId: string | null;
  recoveryStartedAt: string | null;
  previousAcceptAt: string | null;
  lastEvent: RecoveryEventKind | null;
  updatedAt: string;
};

const RECOVERY_STORAGE_KEY = "field_tracking_recovery_state";

export function newRecoveryAttemptId(nowMs = Date.now()): string {
  return `rec_${nowMs}_${Math.random().toString(16).slice(2, 8)}`;
}

export function isRecoveryPass(
  recoveryStartedAt: string | null | undefined,
  newAcceptAt: string | null | undefined,
): boolean {
  if (!recoveryStartedAt || !newAcceptAt) return false;
  const started = new Date(recoveryStartedAt).getTime();
  const accept = new Date(newAcceptAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(accept)) return false;
  return accept > started;
}

export function isRecoveryFailed(
  taskStarted: boolean,
  recoveryStartedAt: string | null | undefined,
  newAcceptAt: string | null | undefined,
): boolean {
  if (!recoveryStartedAt || !taskStarted) return false;
  return !isRecoveryPass(recoveryStartedAt, newAcceptAt);
}

export function deriveRecoveryStateFromHealth(input: {
  taskRegistered: boolean;
  acceptStale: boolean;
  zombieFgs: boolean;
  taskDead: boolean;
  recoveryRequired: boolean;
  recoveryInProgress: boolean;
  recoveryPass: boolean;
  recoveryFailed: boolean;
}): RecoveryStateKind {
  if (input.recoveryPass) return "RECOVERED";
  if (input.recoveryFailed) return "RECOVERY_FAILED";
  if (input.recoveryInProgress) return "RECOVERY_IN_PROGRESS";
  if (input.recoveryRequired) return "RECOVERY_REQUIRED";
  if (input.zombieFgs) return "ZOMBIE_FGS";
  if (input.taskDead) return "TASK_DEAD";
  if (input.acceptStale) return "ACCEPT_STALE";
  if (input.taskRegistered && !input.acceptStale) return "HEALTHY";
  return "HEALTHY";
}

export function nextRecoveryEvent(
  current: RecoveryEventKind | null,
  event: RecoveryEventKind,
): RecoveryEventKind {
  return event;
}

const DEFAULT_PERSISTED: RecoveryPersistedState = {
  required: false,
  reason: null,
  state: "HEALTHY",
  recoveryAttemptId: null,
  recoveryStartedAt: null,
  previousAcceptAt: null,
  lastEvent: null,
  updatedAt: new Date(0).toISOString(),
};

export async function readRecoveryState(): Promise<RecoveryPersistedState> {
  const raw = await AsyncStorage.getItem(RECOVERY_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PERSISTED };
  try {
    return { ...DEFAULT_PERSISTED, ...(JSON.parse(raw) as RecoveryPersistedState) };
  } catch {
    return { ...DEFAULT_PERSISTED };
  }
}

export async function persistRecoveryState(
  patch: Partial<RecoveryPersistedState> & { required?: boolean; reason?: RecoveryReason },
): Promise<RecoveryPersistedState> {
  const prev = await readRecoveryState();
  const next: RecoveryPersistedState = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function beginRecoveryAttempt(
  previousAcceptAt: string | null,
  reason: RecoveryReason,
): Promise<RecoveryPersistedState> {
  const now = new Date().toISOString();
  const attemptId = newRecoveryAttemptId();
  return persistRecoveryState({
    required: true,
    reason,
    state: "RECOVERY_IN_PROGRESS",
    recoveryAttemptId: attemptId,
    recoveryStartedAt: now,
    previousAcceptAt,
    lastEvent: "RESTART_REQUESTED",
  });
}

export async function recordRecoveryEvent(event: RecoveryEventKind): Promise<RecoveryPersistedState> {
  const prev = await readRecoveryState();
  return persistRecoveryState({
    lastEvent: nextRecoveryEvent(prev.lastEvent, event),
    state:
      event === "RECOVERY_CONFIRMED"
        ? "RECOVERED"
        : event === "RECOVERY_FAILED"
          ? "RECOVERY_FAILED"
          : prev.state,
    required: event === "RECOVERY_CONFIRMED" ? false : prev.required,
  });
}

export async function evaluateRecoveryOutcome(input: {
  taskStarted: boolean;
  lastAcceptedAt: string | null;
}): Promise<RecoveryPersistedState> {
  const prev = await readRecoveryState();
  if (prev.state !== "RECOVERY_IN_PROGRESS" || !prev.recoveryStartedAt) {
    return prev;
  }

  if (isRecoveryPass(prev.recoveryStartedAt, input.lastAcceptedAt)) {
    return persistRecoveryState({
      state: "RECOVERED",
      required: false,
      lastEvent: "RECOVERY_CONFIRMED",
    });
  }

  if (isRecoveryFailed(input.taskStarted, prev.recoveryStartedAt, input.lastAcceptedAt)) {
    return persistRecoveryState({
      state: "RECOVERY_FAILED",
      required: true,
      lastEvent: "RECOVERY_FAILED",
    });
  }

  return prev;
}

export async function clearRecoveryState(): Promise<void> {
  await AsyncStorage.removeItem(RECOVERY_STORAGE_KEY);
}

export async function markRecoveryRequired(reason: RecoveryReason): Promise<RecoveryPersistedState> {
  return persistRecoveryState({
    required: true,
    reason,
    state: reason === "ZOMBIE_FGS" ? "ZOMBIE_FGS" : reason === "TASK_DEAD" ? "TASK_DEAD" : "ACCEPT_STALE",
  });
}
