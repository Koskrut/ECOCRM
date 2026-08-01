import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { StatusPill } from "@/components/ui/StatusPill";
import { useTheme } from "@/lib/design/theme-context";
import { visitStatusLabel } from "@/lib/labels";
import { visitLabel, visitTimeRange } from "@/lib/visit-utils";
import type { VisitSummary } from "@/types/crm";

type VisitCardProps = {
  visit: VisitSummary;
  onPress: () => void;
  highlight?: boolean;
  index?: number;
  ownerLabel?: string | null;
};

export function VisitCard({ visit, onPress, highlight, index = 0, ownerLabel }: VisitCardProps) {
  const theme = useTheme();

  return (
    <AnimatedListItem index={index}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: highlight ? theme.colors.primaryMuted : theme.colors.surface,
            borderColor: highlight ? theme.colors.primary : theme.colors.border,
            ...theme.elevation.sm,
          },
          pressed && styles.pressed,
        ]}>
        <View style={{ flex: 1 }}>
          <Text style={theme.typography.bodyMedium}>{visitLabel(visit)}</Text>
          <View style={styles.metaRow}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              {visitTimeRange(visit)}
            </Text>
            <StatusPill label={visitStatusLabel(visit.status)} tone="info" />
          </View>
          {ownerLabel ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {ownerLabel}
            </Text>
          ) : null}
          {visit.addressText ? (
            <Text
              style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 6 }]}
              numberOfLines={2}>
              {visit.addressText}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </Pressable>
    </AnimatedListItem>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  pressed: { opacity: 0.82 },
});
