import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import "react-native-reanimated";

import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { useColorScheme } from "@/components/useColorScheme";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { ActiveWorkProvider } from "@/context/active-work-context";
import { ModulesProvider } from "@/context/modules-context";
import { OfflineQueueProvider } from "@/context/offline-queue-context";
import { ShiftTrackingProvider } from "@/context/shift-tracking-context";
import { installGlobalErrorHandlers } from "@/lib/error-log";
import { t } from "@/lib/i18n";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    const root = segments[0];
    if (!token && root !== "login") {
      router.replace("/login");
      return;
    }
    if (token && root === "login") {
      router.replace("/");
    }
  }, [ready, segments, token, router]);

  return children;
}

export default function RootLayout() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  return (
    <RootErrorBoundary>
      <AuthProvider>
        <ModulesProvider>
          <ActiveWorkProvider>
            <OfflineQueueProvider>
              <ShiftTrackingProvider>
                <RouteGuard>
                  <RootLayoutNav />
                </RouteGuard>
              </ShiftTrackingProvider>
            </OfflineQueueProvider>
          </ActiveWorkProvider>
        </ModulesProvider>
      </AuthProvider>
    </RootErrorBoundary>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { ready } = useAuth();

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="visit/[id]" options={{ title: t("visit.title"), headerShown: true }} />
        <Stack.Screen name="contact/[id]" options={{ title: t("clients.card"), headerShown: true }} />
        <Stack.Screen
          name="contact/[id]/activity/new"
          options={{ title: "Нотатка", headerShown: true }}
        />
        <Stack.Screen name="contacts/new" options={{ title: "Новий контакт", headerShown: true }} />
        <Stack.Screen name="leads/index" options={{ title: "Ліди", headerShown: true }} />
        <Stack.Screen name="leads/[id]" options={{ title: "Лід", headerShown: true }} />
        <Stack.Screen name="leads/new" options={{ title: "Новий лід", headerShown: true }} />
        <Stack.Screen name="map" options={{ title: t("map.title"), headerShown: true }} />
        <Stack.Screen name="catalog/index" options={{ title: t("catalog.title"), headerShown: true }} />
        <Stack.Screen name="calls/queue" options={{ title: t("calls.queueTitle"), headerShown: true }} />
        <Stack.Screen name="calls/session" options={{ title: t("calls.sessionTitle"), headerShown: true }} />
        <Stack.Screen
          name="contact/[id]/edit"
          options={{ title: t("clients.edit"), headerShown: true }}
        />
        <Stack.Screen name="visits/new" options={{ title: "Новий візит", headerShown: true }} />
        <Stack.Screen name="visits/backlog" options={{ title: "Беклог", headerShown: true }} />
        <Stack.Screen name="visits/history" options={{ title: "Історія", headerShown: true }} />
        <Stack.Screen name="tasks/new" options={{ title: "Нове завдання", headerShown: true }} />
        <Stack.Screen name="tasks/[id]" options={{ title: "Завдання", headerShown: true }} />
        <Stack.Screen name="orders/index" options={{ title: "Замовлення", headerShown: true }} />
        <Stack.Screen name="orders/new" options={{ title: "Нове замовлення", headerShown: true }} />
        <Stack.Screen name="orders/[id]" options={{ title: "Замовлення", headerShown: true }} />
        <Stack.Screen name="fuel/index" options={{ title: t("fuel.title"), headerShown: true }} />
        <Stack.Screen name="fuel/[date]" options={{ title: t("fuel.day"), headerShown: true }} />
        <Stack.Screen name="fuel/profile" options={{ title: t("fuel.profile"), headerShown: true }} />
      </Stack>
    </ThemeProvider>
  );
}
