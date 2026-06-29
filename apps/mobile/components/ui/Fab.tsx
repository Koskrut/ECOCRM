import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { useTheme } from "@/lib/design/theme-context";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export function Fab({
  onPress,
  icon = "add",
  color,
  accessibilityLabel,
  style,
}: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const bg = color ?? theme.colors.order;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.92, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        animatedStyle,
        styles.fab,
        { backgroundColor: bg },
        theme.elevation.lg,
        style,
      ]}>
      <Ionicons name={icon} size={28} color={theme.colors.textInverse} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 0,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
