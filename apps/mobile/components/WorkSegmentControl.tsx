import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { colors, radius, spacing } from "@/lib/design/tokens";

export type WorkSegment = "orders" | "calls" | "catalog";

const LABELS: Record<WorkSegment, string> = {
  orders: "Замовлення",
  calls: "Дзвінки",
  catalog: "Каталог",
};

type Props = {
  value: WorkSegment;
  onChange: (v: WorkSegment) => void;
  showCalls?: boolean;
};

export function WorkSegmentControl({ value, onChange, showCalls = true }: Props) {
  const segments = (["orders", "calls", "catalog"] as WorkSegment[]).filter(
    (s) => s !== "calls" || showCalls,
  );

  return (
    <View style={styles.row}>
      {segments.map((seg) => (
        <Pressable
          key={seg}
          onPress={() => onChange(seg)}
          style={[styles.chip, value === seg && styles.chipOn]}>
          <Text style={[styles.text, value === seg && styles.textOn]}>{LABELS[seg]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.chip,
  },
  chipOn: { backgroundColor: colors.chipOn },
  text: { fontSize: 14, opacity: 0.75 },
  textOn: { fontWeight: "700", opacity: 1, color: colors.primaryText },
});
