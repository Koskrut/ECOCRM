import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { apiFetch } from "@/lib/api";

export const CRM_ALERTS_CHANNEL_ID = "crm-alerts-v2";

let handlerInstalled = false;
let cachedToken: string | null = null;

export function getCachedPushToken(): string | null {
  return cachedToken;
}

export function ensureNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureMobilePushChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CRM_ALERTS_CHANNEL_ID, {
    name: "CRM сповіщення",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
    enableVibrate: true,
  });
}

function getProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return (
    extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  );
}

export async function registerForPushNotificationsAsync(authToken: string): Promise<string | null> {
  if (Platform.OS !== "android") return null;

  ensureNotificationHandler();
  await ensureMobilePushChannel();

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) return null;

  const projectId = getProjectId();
  if (!projectId) return null;

  const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  cachedToken = expoToken;

  await apiFetch("/notifications/push-devices", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({
      token: expoToken,
      platform: "android",
    }),
  });

  return expoToken;
}

export async function unregisterPushToken(
  authToken: string | null,
  pushToken: string | null = cachedToken,
): Promise<void> {
  const token = pushToken ?? cachedToken;
  if (authToken && token) {
    try {
      await apiFetch(`/notifications/push-devices/${encodeURIComponent(token)}`, {
        method: "DELETE",
        token: authToken,
      });
    } catch {
      /* proceed with local logout */
    }
  }
  cachedToken = null;
}
