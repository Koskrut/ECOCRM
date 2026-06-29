import * as Location from "expo-location";
import { Alert, Platform } from "react-native";

import { VISIT_GPS_MAX_ACCURACY_M } from "./geo-utils";
import { t } from "./i18n";

export type GpsCapturePayload = {
  lat: number;
  lng: number;
  accuracyM?: number;
  clientRecordedAt: string;
  permissionState: string;
  locationProvider: string;
};

const CAPTURE_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 2;

async function captureOnce(permissionState: string): Promise<GpsCapturePayload | null> {
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  const c = pos.coords;
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracyM:
      typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
    clientRecordedAt: new Date().toISOString(),
    permissionState,
    locationProvider:
      Platform.select({ ios: "ios-core", android: "android-fused", default: "expo-location" }) ??
      "expo-location",
  };
}

export async function captureGpsForVisitRequest(): Promise<
  Record<string, unknown> | undefined
> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(t("gps.title"), t("gps.denied"));
    return { permissionState: status };
  }

  let best: GpsCapturePayload | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await Promise.race([
        captureOnce(status),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS)),
      ]);
      if (!payload) continue;
      if (
        !best ||
        (payload.accuracyM != null &&
          (best.accuracyM == null || payload.accuracyM < best.accuracyM))
      ) {
        best = payload;
      }
      if (best.accuracyM != null && best.accuracyM <= VISIT_GPS_MAX_ACCURACY_M) {
        break;
      }
    } catch {
      /* retry */
    }
  }

  if (!best) {
    Alert.alert(t("gps.title"), t("gps.failed"));
    return { permissionState: status };
  }

  if (best.accuracyM != null && best.accuracyM > VISIT_GPS_MAX_ACCURACY_M) {
    Alert.alert(t("gps.title"), t("gps.weakAccuracy", { meters: Math.round(best.accuracyM) }));
  }

  return best;
}
