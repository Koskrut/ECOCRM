import { ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import "@/lib/location-tracking-task";
import "@/lib/location-tracking-watchdog";

import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { PushNotificationsProvider } from "@/context/push-notifications-context";
import { PresenceHeartbeatProvider } from "@/context/presence-context";
import { ActiveWorkProvider } from "@/context/active-work-context";
import { ModulesProvider } from "@/context/modules-context";
import { OfflineQueueProvider } from "@/context/offline-queue-context";
import { ServerConfigProvider, useServerConfig } from "@/context/server-config-context";
import { ShiftTrackingProvider } from "@/context/shift-tracking-context";
import { VisitGeofenceProvider } from "@/context/visit-geofence-context";
import { AppThemeProvider, useTheme } from "@/lib/design/theme-context";
import { installGlobalErrorHandlers } from "@/lib/error-log";
import { t } from "@/lib/i18n";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { apiUrl, ready: serverReady } = useServerConfig();
  const { token, ready: authReady } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!serverReady || !authReady) return;

    const root = segments[0];

    if (!apiUrl) {
      if (root !== "server-setup") {
        router.replace("/server-setup");
      }
      return;
    }

    if (!token && root !== "login" && root !== "server-setup") {
      router.replace("/login");
      return;
    }

    if (token && (root === "login" || root === "server-setup")) {
      router.replace("/");
    }
  }, [serverReady, authReady, apiUrl, segments, token, router]);

  return children;
}

export default function RootLayout() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <AppThemeProvider>
          <ServerConfigProvider>
            <AuthProvider>
              <PushNotificationsProvider>
                <PresenceHeartbeatProvider>
                  <ModulesProvider>
                    <ActiveWorkProvider>
                      <OfflineQueueProvider>
                        <ShiftTrackingProvider>
                          <VisitGeofenceProvider>
                            <RouteGuard>
                              <RootLayoutNav />
                            </RouteGuard>
                          </VisitGeofenceProvider>
                        </ShiftTrackingProvider>
                      </OfflineQueueProvider>
                    </ActiveWorkProvider>
                  </ModulesProvider>
                </PresenceHeartbeatProvider>
              </PushNotificationsProvider>
            </AuthProvider>
          </ServerConfigProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}

function RootLayoutNav() {
  const { ready: authReady } = useAuth();
  const { ready: serverReady } = useServerConfig();
  const { navTheme, colors, typography } = useTheme();
  const ready = serverReady && authReady;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const screenOptions = {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.primary,
    headerTitleStyle: {
      ...typography.section,
      color: colors.text,
    },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bg },
    ...(Platform.OS === "android" ? { headerTopInsetEnabled: true as const } : {}),
  };

  return (
    <ThemeProvider value={navTheme}>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="server-setup" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="visit/[id]" options={{ title: t("visit.title"), headerShown: true }} />
        <Stack.Screen name="contact/[id]" options={{ title: t("clients.card"), headerShown: true }} />
        <Stack.Screen
          name="contact/[id]/activity/new"
          options={{ title: t("screens.noteNew"), headerShown: true }}
        />
        <Stack.Screen name="contacts/new" options={{ title: t("screens.contactNew"), headerShown: true }} />
        <Stack.Screen name="company/[id]" options={{ title: t("screens.companyDetail"), headerShown: true }} />
        <Stack.Screen name="companies/new" options={{ title: t("screens.companyNew"), headerShown: true }} />
        <Stack.Screen name="leads/index" options={{ title: t("leads.title"), headerShown: true }} />
        <Stack.Screen name="leads/[id]" options={{ title: t("leads.detail"), headerShown: true }} />
        <Stack.Screen name="leads/new" options={{ title: t("leads.new"), headerShown: true }} />
        <Stack.Screen name="map" options={{ headerShown: false }} />
        <Stack.Screen name="map/[date]" options={{ title: t("map.title"), headerShown: true }} />
        <Stack.Screen name="catalog/index" options={{ title: t("catalog.title"), headerShown: true }} />
        <Stack.Screen name="calls/queue" options={{ title: t("calls.queueTitle"), headerShown: true }} />
        <Stack.Screen name="calls/session" options={{ title: t("calls.sessionTitle"), headerShown: true }} />
        <Stack.Screen
          name="contact/[id]/edit"
          options={{ title: t("clients.edit"), headerShown: true }}
        />
        <Stack.Screen name="visits/new" options={{ title: t("screens.visitNew"), headerShown: true }} />
        <Stack.Screen name="visits/backlog" options={{ title: t("screens.visitBacklog"), headerShown: true }} />
        <Stack.Screen name="visits/schedule" options={{ title: t("visits.scheduleTitle"), headerShown: true }} />
        <Stack.Screen name="visits/history" options={{ title: t("screens.visitHistory"), headerShown: true }} />
        <Stack.Screen name="tasks/new" options={{ title: t("screens.taskNew"), headerShown: true }} />
        <Stack.Screen name="tasks/[id]" options={{ title: t("screens.taskDetail"), headerShown: true }} />
        <Stack.Screen name="orders/index" options={{ title: t("screens.orders"), headerShown: true }} />
        <Stack.Screen name="orders/new" options={{ title: t("screens.orderNew"), headerShown: true }} />
        <Stack.Screen name="orders/[id]" options={{ title: t("screens.orderDetail"), headerShown: true }} />
        <Stack.Screen name="orders/[id]/edit" options={{ title: t("orders.editTitle"), headerShown: true }} />
        <Stack.Screen name="fuel/index" options={{ title: t("fuel.title"), headerShown: true }} />
        <Stack.Screen name="fuel/[date]" options={{ title: t("fuel.day"), headerShown: true }} />
        <Stack.Screen name="fuel/profile" options={{ title: t("fuel.profile"), headerShown: true }} />
      </Stack>
    </ThemeProvider>
  );
}
