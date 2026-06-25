import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/lib/design/tokens";

type Tone = "default" | "success" | "warning" | "danger" | "info";

const TONE_BG: Record<Tone, string> = {
  default: colors.chip,
  success: "rgba(16,185,129,0.18)",
  warning: "rgba(245,158,11,0.18)",
  danger: "rgba(239,68,68,0.18)",
  info: colors.primaryMuted,
};

const TONE_TEXT: Record<Tone, string> = {
  default: colors.textMuted,
  success: "#6ee7b7",
  warning: "#fcd34d",
  danger: "#fca5a5",
  info: colors.primaryText,
};

type Props = {
  label: string;
  tone?: Tone;
};

export function StatusPill({ label, tone = "default" }: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: TONE_BG[tone] }]}>
      <Text style={[styles.text, { color: TONE_TEXT[tone] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: { fontSize: 12, fontWeight: "600" },
});
