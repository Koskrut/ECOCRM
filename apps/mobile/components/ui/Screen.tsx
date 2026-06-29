import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useTheme } from "@/lib/design/theme-context";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  gradient?: boolean;
  padded?: boolean;
};

export function Screen({
  children,
  style,
  contentStyle,
  edges = ["top", "left", "right"],
  gradient = true,
  padded = true,
}: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }, style]}>
      {gradient ? (
        <LinearGradient
          colors={[theme.colors.primaryMuted, "transparent"]}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <SafeAreaView
        edges={edges}
        style={[
          styles.safe,
          padded && { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
          contentStyle,
        ]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    opacity: 0.55,
  },
  safe: { flex: 1 },
});
