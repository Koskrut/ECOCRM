import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";

export type StatTile = {
  key: string;
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  bg: string;
  onPress?: () => void;
};

type Props = {
  tiles: StatTile[];
};

export function StatTiles({ tiles }: Props) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { gap: theme.spacing.sm, marginBottom: theme.spacing.md }]}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.key}
          onPress={tile.onPress}
          disabled={!tile.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: tile.bg,
              borderColor: theme.colors.border,
              minWidth: 100,
            },
            pressed && tile.onPress && { opacity: 0.85 },
          ]}>
          <Ionicons name={tile.icon} size={18} color={tile.color} />
          <Text style={[theme.typography.bodyMedium, { marginTop: 6 }]}>{tile.value}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
            {tile.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingRight: 4 },
  tile: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
