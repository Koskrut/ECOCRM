import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Tabs } from "expo-router";

import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import { useModules } from "@/context/modules-context";
import { t } from "@/lib/i18n";

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { visitsEnabled } = useModules();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.today"),
          tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t("tabs.map"),
          href: visitsEnabled ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="map-marker" color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("tabs.clients"),
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t("tabs.tasks"),
          tabBarIcon: ({ color }) => <TabBarIcon name="check-square-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("tabs.more"),
          tabBarIcon: ({ color }) => <TabBarIcon name="ellipsis-h" color={color} />,
        }}
      />
    </Tabs>
  );
}
