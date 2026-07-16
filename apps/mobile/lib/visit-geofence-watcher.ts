import AsyncStorage from "@react-native-async-storage/async-storage";

import { ensureNotificationHandler } from "./push-notifications";
import { haversineDistanceM, VISIT_GPS_MAX_ACCURACY_M } from "./geo-utils";
import { STORAGE_KEYS_EXTRA } from "./location-tracking-config";
import type { ProcessLocationResult } from "./location-tracking-processor";
import { t } from "./i18n";
import type { VisitSummary } from "@/types/crm";
import * as Notifications from "expo-notifications";

ensureNotificationHandler();

type GeofenceState = {
  dateKey: string;
  notifiedIds: string[];
};

async function readGeofenceState(dateKey: string): Promise<GeofenceState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS_EXTRA.GEOFENCE_NOTIFIED);
  if (!raw) return { dateKey, notifiedIds: [] };
  try {
    const parsed = JSON.parse(raw) as GeofenceState;
    if (parsed.dateKey !== dateKey) return { dateKey, notifiedIds: [] };
    return { dateKey, notifiedIds: Array.isArray(parsed.notifiedIds) ? parsed.notifiedIds : [] };
  } catch {
    return { dateKey, notifiedIds: [] };
  }
}

async function writeGeofenceState(state: GeofenceState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS_EXTRA.GEOFENCE_NOTIFIED, JSON.stringify(state));
}

export async function resetGeofenceNotifications(dateKey: string): Promise<void> {
  await writeGeofenceState({ dateKey, notifiedIds: [] });
}

export async function ensureGeofenceNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function eligibleVisits(visits: VisitSummary[]): VisitSummary[] {
  return visits.filter(
    (v) =>
      v.status === "SCHEDULED" &&
      typeof v.lat === "number" &&
      typeof v.lng === "number" &&
      Number.isFinite(v.lat) &&
      Number.isFinite(v.lng),
  );
}

export async function handleGeofenceLocationUpdate(
  result: ProcessLocationResult,
  visits: VisitSummary[],
  dateKey: string,
): Promise<void> {
  if (!result.accepted || !result.sample) return;

  const { lat, lng, accuracyM } = result.sample;
  if (
    accuracyM != null &&
    typeof accuracyM === "number" &&
    Number.isFinite(accuracyM) &&
    accuracyM > VISIT_GPS_MAX_ACCURACY_M
  ) {
    return;
  }

  const state = await readGeofenceState(dateKey);
  const pending = eligibleVisits(visits).filter((v) => !state.notifiedIds.includes(v.id));
  if (pending.length === 0) return;

  let nearest: { visit: VisitSummary; distM: number } | null = null;
  for (const visit of pending) {
    const distM = haversineDistanceM(lat, lng, visit.lat!, visit.lng!);
    if (!nearest || distM < nearest.distM) {
      nearest = { visit, distM };
    }
  }
  if (!nearest) return;

  const radiusM = nearest.visit.radiusM != null && nearest.visit.radiusM > 0 ? nearest.visit.radiusM : 100;
  if (nearest.distM > radiusM) return;

  const granted = await ensureGeofenceNotificationPermission();
  if (!granted) return;

  const label =
    nearest.visit.title?.trim() ||
    nearest.visit.addressText?.trim() ||
    t("visit.defaultTitle");

  await Notifications.scheduleNotificationAsync({
    content: {
      title: t("geofence.atAddressTitle"),
      body: t("geofence.atAddressBody", { label }),
      data: { visitId: nearest.visit.id },
      sound: "default",
    },
    trigger: null,
  });

  state.notifiedIds.push(nearest.visit.id);
  await writeGeofenceState(state);
}
