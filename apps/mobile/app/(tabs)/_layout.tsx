import React from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActiveWorkBanner } from "@/components/ActiveWorkBanner";
import { AppTabBar } from "@/components/ui/AppTabBar";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { useTabBarInset } from "@/lib/use-tab-bar-inset";

function TabNavigator() {
  const theme = useTheme();
  const tabBarInset = useTabBarInset();

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        // Custom AppHeader / TodayHeader on each tab — native header would duplicate titles and steal list height.
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.bg, paddingBottom: tabBarInset },
      }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.today"),
          }}
        />
        <Tabs.Screen
          name="work"
          options={{
            title: t("tabs.work"),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="clients"
          options={{
            title: t("tabs.clients"),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: t("tabs.tasks"),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t("tabs.more"),
          }}
        />
      </Tabs>
  );
}

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: theme.colors.bg }}>
        <ActiveWorkBanner />
      </View>
      <TabNavigator />
    </View>
  );
}
