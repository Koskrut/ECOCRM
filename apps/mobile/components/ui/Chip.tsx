import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/lib/design/theme-context";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected, onPress }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.chipOn : theme.colors.chip,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}>
      <Text
        style={[
          styles.label,
          { color: selected ? theme.colors.primaryText : theme.colors.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
