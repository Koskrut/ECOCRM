import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/design/theme-context";

const TAB_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  index: "today-outline",
  work: "briefcase-outline",
  clients: "people-outline",
  tasks: "checkbox-outline",
  more: "ellipsis-horizontal-circle-outline",
};

const TAB_ICONS_ACTIVE: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  index: "today",
  work: "briefcase",
  clients: "people",
  tasks: "checkbox",
  more: "ellipsis-horizontal-circle",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AppTabBar({ state, descriptors, navigation }: any) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <BlurView
        intensity={theme.scheme === "dark" ? 60 : 80}
        tint={theme.scheme}
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.tabBar,
            borderColor: theme.colors.tabBarBorder,
          },
        ]}>
        {state.routes.map((route: { key: string; name: string; params?: object }, index: number) => {
          const { options } = descriptors[route.key];
          if (options.href === null) return null;

          const rawLabel = options.tabBarLabel ?? options.title ?? route.name;
          const label = typeof rawLabel === "string" ? rawLabel : route.name;

          const isFocused = state.index === index;
          const iconName = isFocused
            ? TAB_ICONS_ACTIVE[route.name] ?? "ellipse"
            : TAB_ICONS[route.name] ?? "ellipse-outline";

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              void Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={styles.tab}>
              <View
                style={[
                  styles.iconWrap,
                  isFocused && { backgroundColor: theme.colors.primaryMuted },
                ]}>
                <Ionicons
                  name={iconName}
                  size={22}
                  color={isFocused ? theme.colors.primary : theme.colors.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  { color: isFocused ? theme.colors.primary : theme.colors.textMuted },
                ]}
                numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
  },
  bar: {
    flexDirection: "row",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 52,
  },
  iconWrap: {
    width: 36,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
