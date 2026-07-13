import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";

import { useAuth } from "@/context/auth-context";
import { navigateFromNotificationData } from "@/lib/notification-navigation";
import {
  ensureNotificationHandler,
  registerForPushNotificationsAsync,
} from "@/lib/push-notifications";

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    ensureNotificationHandler();
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    void registerForPushNotificationsAsync(token);
  }, [ready, token]);

  useEffect(() => {
    if (!token) return;
    const sub = Notifications.addPushTokenListener(() => {
      void registerForPushNotificationsAsync(token);
    });
    return () => sub.remove();
  }, [token]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && typeof data === "object") {
        navigateFromNotificationData(router, data as Record<string, unknown>);
      }
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data;
      if (data && typeof data === "object") {
        navigateFromNotificationData(router, data as Record<string, unknown>);
      }
    });

    return () => sub.remove();
  }, [router]);

  return <>{children}</>;
}
