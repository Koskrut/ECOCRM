import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  done: number;
  total: number;
  size?: number;
  strokeWidth?: number;
};

export function ProgressRing({ done, total, size = 72, strokeWidth = 6 }: Props) {
  const theme = useTheme();
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withTiming(ratio, { duration: 600 });
  }, [ratio, anim]);

  const fillStyle = useAnimatedStyle(() => ({
    height: `${anim.value * 100}%` as `${number}%`,
  }));

  const inner = size - strokeWidth * 2;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: theme.colors.successMuted,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.surface,
      }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { top: undefined, bottom: 0, backgroundColor: theme.colors.successMuted },
          fillStyle,
        ]}
      />
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.bg,
        }}>
        <Text style={[theme.typography.caption, { fontWeight: "700", color: theme.colors.text }]}>
          {total > 0 ? t("today.progressRing", { done, total }) : "—"}
        </Text>
      </View>
    </View>
  );
}
