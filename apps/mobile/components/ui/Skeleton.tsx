import { MotiView } from "moti";
import { Skeleton as MotiSkeleton } from "moti/skeleton";
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/lib/design/theme-context";

type Props = {
  width?: number;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width, height = 16, radius = 8, style }: Props) {
  const theme = useTheme();
  const resolvedWidth = width ?? ("100%" as const);

  return (
    <MotiView style={style}>
      <MotiSkeleton
        colorMode={theme.scheme}
        colors={[theme.colors.skeleton, theme.colors.skeletonHighlight, theme.colors.skeleton]}
        width={resolvedWidth}
        height={height}
        radius={radius}
      />
    </MotiView>
  );
}

export function SkeletonCard() {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.sm,
        gap: 10,
      }}>
      <Skeleton height={18} width={220} />
      <Skeleton height={14} width={140} />
      <Skeleton height={12} width={280} />
    </View>
  );
}
