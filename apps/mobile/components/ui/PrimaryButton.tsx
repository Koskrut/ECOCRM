import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing } from "@/lib/design/tokens";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  style,
}: Props) {
  const bg =
    variant === "danger" ? colors.danger : variant === "secondary" ? colors.surfaceMuted : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg },
        (disabled || loading || pressed) && styles.dim,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  dim: { opacity: 0.72 },
  label: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
