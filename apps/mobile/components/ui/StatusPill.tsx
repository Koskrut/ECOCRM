import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/lib/design/theme-context";

type Tone = "default" | "success" | "warning" | "danger" | "info";

type Props = {
  label: string;
  tone?: Tone;
};

export function StatusPill({ label, tone = "default" }: Props) {
  const theme = useTheme();

  const toneMap: Record<Tone, { bg: string; text: string }> = {
    default: { bg: theme.colors.chip, text: theme.colors.text },
    success: { bg: theme.colors.successMuted, text: theme.colors.successText },
    warning: { bg: theme.colors.warningMuted, text: theme.colors.warningText },
    danger: { bg: theme.colors.dangerMuted, text: theme.colors.dangerText },
    info: { bg: theme.colors.primaryMuted, text: theme.colors.primaryText },
  };

  const colors = toneMap[tone];

  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
