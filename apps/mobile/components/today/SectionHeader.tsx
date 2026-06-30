import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  title: string;
  onSeeAll?: () => void;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, onSeeAll, actionLabel, onAction }: Props) {
  const theme = useTheme();
  const action = onAction ?? onSeeAll;
  const label = actionLabel ?? (onSeeAll ? t("today.seeAll") : undefined);

  return (
    <View style={[styles.row, { marginTop: theme.spacing.md, marginBottom: theme.spacing.sm }]}>
      <Text style={[theme.typography.section, styles.title]}>{title}</Text>
      {action && label ? (
        <Pressable onPress={action} accessibilityRole="button" hitSlop={8}>
          <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "600" }]}>
            {label} ›
          </Text>
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
    gap: 8,
  },
  title: { flex: 1 },
});
