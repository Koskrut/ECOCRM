import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";

type Props = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  left?: React.ReactNode;
};

export function ListItem({ title, subtitle, onPress, right, left }: Props) {
  const theme = useTheme();

  const content = (
    <>
      {left}
      <View style={styles.textCol}>
        <Text style={theme.typography.bodyMedium}>{title}</Text>
        {subtitle ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
          pressed && { opacity: 0.85 },
        ]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  textCol: { flex: 1 },
});
