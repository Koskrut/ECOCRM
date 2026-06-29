import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Chip } from "@/components/ui/Chip";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { orderStageLabel } from "@/lib/labels";
import { ORDER_KANBAN_PRESETS, type OrderStagePreset } from "@/lib/order-list-presets";

type Props = {
  value: OrderStagePreset;
  onChange: (preset: OrderStagePreset) => void;
};

function presetLabel(preset: OrderStagePreset): string {
  if (preset === "all") return t("orders.stageAll");
  return orderStageLabel(preset);
}

export function OrderStagePresets({ value, onChange }: Props) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { gap: theme.spacing.sm, paddingRight: theme.spacing.sm }]}>
      {ORDER_KANBAN_PRESETS.map((preset) => (
        <Chip
          key={preset}
          label={presetLabel(preset)}
          selected={value === preset}
          onPress={() => onChange(preset)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
});
