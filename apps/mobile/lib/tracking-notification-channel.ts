import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const FIELD_TRACKING_CHANNEL_ID = "field-tracking";

/** Best-effort low-importance channel for foreground location service notification. */
export async function ensureFieldTrackingNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    await Notifications.setNotificationChannelAsync(FIELD_TRACKING_CHANNEL_ID, {
      name: "GPS трекінг",
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    });
  } catch {
    /* channel setup is best-effort */
  }
}
