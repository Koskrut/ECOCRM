import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { useTheme } from "@/lib/design/theme-context";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = "default" | "glass" | "elevated";

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: Variant;
};

export function Card({ children, onPress, style, variant = "default" }: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const cardStyle: ViewStyle = {
    backgroundColor:
      variant === "glass" ? theme.colors.surfaceGlass : theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    ...(variant === "elevated" ? theme.elevation.md : {}),
  };

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 18, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 320 });
        }}
        style={[animatedStyle, cardStyle, style]}>
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}
