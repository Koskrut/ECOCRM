import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/lib/design/theme-context";

type Props = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function IconButton({ name, onPress, size = 22, color, style, accessibilityLabel }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: theme.colors.surfaceMuted },
        pressed && { opacity: 0.7 },
        style,
      ]}>
      <Ionicons name={name} size={size} color={color ?? theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
