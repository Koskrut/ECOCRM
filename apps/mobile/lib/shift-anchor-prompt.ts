import * as Location from "expo-location";
import { Alert } from "react-native";

import {
  type FieldShiftAnchorKind,
  type LatLng,
  suggestDestinationKind,
  suggestOriginKind,
} from "@/lib/geo-utils";
import { t } from "@/lib/i18n";

export type ShiftAnchorChoice = {
  kind: FieldShiftAnchorKind;
  lat: number | null;
  lng: number | null;
};

async function captureCurrentGps(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

function garageFromUser(user: {
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  routeEndLat?: number | null;
  routeEndLng?: number | null;
} | null): { start: LatLng | null; end: LatLng | null } {
  const start =
    user?.routeStartLat != null && user?.routeStartLng != null
      ? { lat: user.routeStartLat, lng: user.routeStartLng }
      : null;
  const endExplicit =
    user?.routeEndLat != null && user?.routeEndLng != null
      ? { lat: user.routeEndLat, lng: user.routeEndLng }
      : null;
  return { start, end: endExplicit ?? start };
}

function pickAnchor(
  title: string,
  message: string,
  defaultKind: FieldShiftAnchorKind,
  homeLabel: string,
  currentLabel: string,
): Promise<FieldShiftAnchorKind | null> {
  return new Promise((resolve) => {
    const homeBtn = {
      text: defaultKind === "HOME" ? `${homeLabel} ✓` : homeLabel,
      onPress: () => resolve("HOME"),
    };
    const currentBtn = {
      text: defaultKind === "CURRENT" ? `${currentLabel} ✓` : currentLabel,
      onPress: () => resolve("CURRENT"),
    };
    Alert.alert(title, message, [
      { text: t("common.cancel"), style: "cancel", onPress: () => resolve(null) },
      defaultKind === "HOME" ? homeBtn : currentBtn,
      defaultKind === "HOME" ? currentBtn : homeBtn,
    ]);
  });
}

/** One-shot start chooser: Home vs From here. */
export async function promptShiftOrigin(user: {
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  routeEndLat?: number | null;
  routeEndLng?: number | null;
} | null): Promise<ShiftAnchorChoice | null> {
  const garage = garageFromUser(user);
  const gps = await captureCurrentGps();
  const defaultKind = suggestOriginKind(gps, garage.start);
  const kind = await pickAnchor(
    t("today.shiftOriginTitle"),
    t("today.shiftOriginHint"),
    defaultKind,
    t("today.shiftOriginHome"),
    t("today.shiftOriginCurrent"),
  );
  if (!kind) return null;
  if (kind === "HOME") {
    if (!garage.start) {
      Alert.alert(t("common.error"), t("today.shiftHomeMissing"));
      return null;
    }
    return { kind: "HOME", lat: garage.start.lat, lng: garage.start.lng };
  }
  if (!gps) {
    Alert.alert(t("common.error"), t("today.shiftGpsRequired"));
    return null;
  }
  return { kind: "CURRENT", lat: gps.lat, lng: gps.lng };
}

/** One-shot mobility chooser: car vs walk/transit. */
export async function promptShiftMobility(): Promise<{
  mode: "CAR" | "WALK_TRANSIT";
} | null> {
  return new Promise((resolve) => {
    Alert.alert(t("today.shiftMobilityTitle"), t("today.shiftMobilityHint"), [
      { text: t("common.cancel"), style: "cancel", onPress: () => resolve(null) },
      {
        text: t("today.shiftMobilityCar"),
        onPress: () => resolve({ mode: "CAR" }),
      },
      {
        text: t("today.shiftMobilityWalkTransit"),
        onPress: () => resolve({ mode: "WALK_TRANSIT" }),
      },
    ]);
  });
}

/** One-shot end chooser: Home vs Stay here. */
export async function promptShiftDestination(user: {
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  routeEndLat?: number | null;
  routeEndLng?: number | null;
} | null): Promise<ShiftAnchorChoice | null> {
  const garage = garageFromUser(user);
  const gps = await captureCurrentGps();
  const defaultKind = suggestDestinationKind(gps, garage.end);
  const kind = await pickAnchor(
    t("today.shiftDestinationTitle"),
    t("today.shiftDestinationHint"),
    defaultKind,
    t("today.shiftDestinationHome"),
    t("today.shiftDestinationCurrent"),
  );
  if (!kind) return null;
  if (kind === "HOME") {
    if (!garage.end) {
      Alert.alert(t("common.error"), t("today.shiftHomeMissing"));
      return null;
    }
    return { kind: "HOME", lat: garage.end.lat, lng: garage.end.lng };
  }
  if (!gps) {
    Alert.alert(t("common.error"), t("today.shiftGpsRequired"));
    return null;
  }
  return { kind: "CURRENT", lat: gps.lat, lng: gps.lng };
}
