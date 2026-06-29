import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { DarkTheme, DefaultTheme, type Theme as NavTheme } from "@react-navigation/native";
import React, { createContext, useContext, useMemo } from "react";
import { ActivityIndicator, View } from "react-native";

import { useColorScheme } from "@/components/useColorScheme";

import { darkTheme, lightTheme, type Theme } from "./tokens";

type ThemeContextValue = Theme & {
  navTheme: NavTheme;
  fontsLoaded: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function buildNavTheme(theme: Theme): NavTheme {
  const base = theme.scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.bg,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.primary,
    },
  };
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme() ?? "light";
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const value = useMemo<ThemeContextValue>(() => {
    const theme = systemScheme === "dark" ? darkTheme : lightTheme;
    return {
      ...theme,
      navTheme: buildNavTheme(theme),
      fontsLoaded,
    };
  }, [systemScheme, fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: value.colors.bg }}>
        <ActivityIndicator color={value.colors.primary} />
      </View>
    );
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within AppThemeProvider");
  }
  return ctx;
}

export function makeStyles<T extends Record<string, unknown>>(factory: (theme: Theme) => T) {
  return () => {
    const theme = useTheme();
    return useMemo(() => factory(theme), [theme]);
  };
}
