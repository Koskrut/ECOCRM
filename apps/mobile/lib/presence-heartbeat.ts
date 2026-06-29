import * as Location from "expo-location";
import { AppState, type AppStateStatus } from "react-native";

import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth-token";
import { getTrackingState } from "@/lib/location-tracking";

const HEARTBEAT_INTERVAL_ACTIVE_MS = 60_000;
const HEARTBEAT_INTERVAL_BACKGROUND_MS = 60_000;
const TASK_HEARTBEAT_MIN_INTERVAL_MS = 60_000;

let lastTaskHeartbeatAt = 0;

type HeartbeatCoords = {
  lat?: number;
  lng?: number;
};

type AppPresenceState = "ACTIVE" | "BACKGROUND" | "INACTIVE";

function mapAppState(state: AppStateStatus): AppPresenceState {
  if (state === "active") return "ACTIVE";
  if (state === "background") return "BACKGROUND";
  return "INACTIVE";
}

function heartbeatIntervalMs(state: AppStateStatus = AppState.currentState): number {
  return state === "active" ? HEARTBEAT_INTERVAL_ACTIVE_MS : HEARTBEAT_INTERVAL_BACKGROUND_MS;
}

async function captureCoords(): Promise<HeartbeatCoords> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return {};

    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    if (!pos) return {};

    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
  } catch {
    return {};
  }
}

async function postHeartbeat(
  token: string,
  body: {
    appState: AppPresenceState;
    trackingMode?: string;
    lat?: number;
    lng?: number;
  },
): Promise<void> {
  await apiFetch("/presence/heartbeat", {
    method: "POST",
    token,
    body: JSON.stringify({
      platform: "MOBILE",
      ...body,
    }),
  });
}

export async function sendPresenceHeartbeat(token: string): Promise<void> {
  const appState = mapAppState(AppState.currentState);
  const coords = appState === "ACTIVE" ? await captureCoords() : {};

  let trackingMode: string | undefined;
  try {
    const state = await getTrackingState();
    if (state.mode !== "none") {
      trackingMode = state.mode;
    }
  } catch {
    /* optional */
  }

  await postHeartbeat(token, {
    appState,
    ...(trackingMode ? { trackingMode } : {}),
    ...(coords.lat != null ? { lat: coords.lat } : {}),
    ...(coords.lng != null ? { lng: coords.lng } : {}),
  });
}

/** Lightweight heartbeat from background location task (no getCurrentPosition). */
export async function sendPresenceHeartbeatFromTask(): Promise<void> {
  const now = Date.now();
  if (now - lastTaskHeartbeatAt < TASK_HEARTBEAT_MIN_INTERVAL_MS) return;

  const token = await getAuthToken();
  if (!token) return;

  try {
    await postHeartbeat(token, {
      appState: "BACKGROUND",
      trackingMode: "background",
    });
    lastTaskHeartbeatAt = now;
  } catch {
    /* retry on next location point */
  }
}

export async function endPresenceSession(token: string): Promise<void> {
  await apiFetch("/presence/end", {
    method: "POST",
    token,
    body: JSON.stringify({ platform: "MOBILE" }),
  });
}

export function startPresenceHeartbeat(token: string): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  const schedule = () => {
    if (timer) clearInterval(timer);
    if (cancelled) return;
    timer = setInterval(() => {
      void tick();
    }, heartbeatIntervalMs());
  };

  const tick = async () => {
    if (cancelled || ticking) return;
    ticking = true;
    try {
      await sendPresenceHeartbeat(token);
    } catch {
      /* ignore transient errors */
    } finally {
      ticking = false;
    }
  };

  void tick();
  schedule();

  const onAppState = (_state: AppStateStatus) => {
    void tick();
    schedule();
  };
  const sub = AppState.addEventListener("change", onAppState);

  return () => {
    cancelled = true;
    if (timer) clearInterval(timer);
    sub.remove();
    void endPresenceSession(token).catch(() => undefined);
  };
}
