import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing } from "@/lib/design/tokens";

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, onPress, style }: Props) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.82 },
});
