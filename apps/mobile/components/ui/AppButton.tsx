import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { useTheme } from "@/lib/design/theme-context";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  fullWidth?: boolean;
};

export function AppButton({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  style,
  haptic = true,
  fullWidth,
}: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const isDisabled = disabled || loading;
  const content = loading ? (
    <ActivityIndicator color={variant === "ghost" ? theme.colors.primary : theme.colors.textInverse} />
  ) : (
    <Text
      style={[
        theme.typography.button,
        {
          color:
            variant === "ghost"
              ? theme.colors.primary
              : variant === "secondary"
                ? theme.colors.text
                : theme.colors.textInverse,
        },
      ]}>
      {label}
    </Text>
  );

  if (variant === "primary") {
    return (
      <AnimatedPressable
        onPress={handlePress}
        disabled={isDisabled}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 16, stiffness: 280 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 280 });
        }}
        accessibilityRole="button"
        style={[animatedStyle, fullWidth && styles.fullWidth, style, isDisabled && styles.dim]}>
        <LinearGradient
          colors={[theme.colors.primaryGradientStart, theme.colors.primaryGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.btn, fullWidth && styles.fullWidth]}>
          {content}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  const bg =
    variant === "danger"
      ? theme.colors.danger
      : variant === "secondary"
        ? theme.colors.surfaceMuted
        : "transparent";

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={isDisabled}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 16, stiffness: 280 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 280 });
      }}
      accessibilityRole="button"
      style={[
        animatedStyle,
        styles.btn,
        {
          backgroundColor: bg,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: theme.colors.border,
        },
        fullWidth && styles.fullWidth,
        style,
        isDisabled && styles.dim,
      ]}>
      {content}
    </AnimatedPressable>
  );
}

/** @deprecated Use AppButton */
export const PrimaryButton = AppButton;

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: { alignSelf: "stretch", width: "100%" },
  dim: { opacity: 0.65 },
});
