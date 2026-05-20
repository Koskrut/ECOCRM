import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { AuthProvider, useAuth } from "@/context/auth-context";

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
      return;
    }
    if (!token && root === "visit") {
      router.replace("/login");
      return;
    }
  }, [ready, segments, token, router]);

  return children;
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <AuthProvider>
      <RouteGuard>
        <RootLayoutNav />
      </RouteGuard>
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { ready } = useAuth();

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="visit/[id]" options={{ title: "Визит", headerShown: true }} />
        <Stack.Screen name="fuel/index" options={{ title: "Топливо", headerShown: true }} />
        <Stack.Screen name="fuel/[date]" options={{ title: "День", headerShown: true }} />
        <Stack.Screen name="fuel/profile" options={{ title: "Профиль авто", headerShown: true }} />
      </Stack>
    </ThemeProvider>
  );
}
