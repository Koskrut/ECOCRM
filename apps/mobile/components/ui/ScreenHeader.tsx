import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { colors, spacing, typography } from "@/lib/design/tokens";

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ScreenHeader({ title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: { ...typography.title },
  action: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
  },
  actionText: { color: colors.primaryText, fontWeight: "700" },
});
