import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  subtitle?: string;
  large?: boolean;
};

export function AppHeader({ title, actionLabel, onAction, subtitle, large = true }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={[large ? theme.typography.display : theme.typography.title, styles.title]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.colors.primaryMuted },
            pressed && { opacity: 0.75 },
          ]}>
          <Text style={{ color: theme.colors.primaryText, fontWeight: "700" }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** @deprecated Use AppHeader */
export const ScreenHeader = AppHeader;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  textCol: { flex: 1 },
  title: {},
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
});
