import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { warehousesApi, type Warehouse } from "@/lib/api/warehouses";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";

type Props = {
  token: string;
  value: string | null;
  onChange: (id: string) => void;
};

export function WarehousePicker({ token, value, onChange }: Props) {
  const theme = useTheme();
  const [items, setItems] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await warehousesApi.list(token);
        const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder);
        setItems(sorted);
        if (!value && sorted[0]) onChange(sorted[0].id);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- default warehouse once on load
  }, [token]);

  if (loading) return <Text style={{ color: theme.colors.textMuted }}>{t("common.loading")}</Text>;
  if (items.length === 0) return <Text style={{ color: theme.colors.textMuted }}>{t("common.noData")}</Text>;

  return (
    <View style={styles.row}>
      {items.map((w) => (
        <Pressable
          key={w.id}
          onPress={() => onChange(w.id)}
          style={[
            styles.chip,
            { borderColor: theme.colors.border },
            value === w.id && {
              backgroundColor: theme.colors.orderMuted,
              borderColor: theme.colors.order,
            },
          ]}
          accessibilityRole="button">
          <Text
            style={[
              styles.chipText,
              { color: theme.colors.text },
              value === w.id && { fontWeight: "700", color: theme.colors.order },
            ]}>
            {w.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 14 },
});
