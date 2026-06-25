import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { visitLabel, visitTimeRange } from "@/lib/visit-utils";
import type { VisitSummary } from "@/types/crm";

type VisitCardProps = {
  visit: VisitSummary;
  onPress: () => void;
  highlight?: boolean;
};

export function VisitCard({ visit, onPress, highlight }: VisitCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        highlight && styles.highlight,
        pressed && styles.pressed,
      ]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{visitLabel(visit)}</Text>
        <Text style={styles.meta}>
          {visitTimeRange(visit)}
          {visitTimeRange(visit) ? " · " : ""}
          {visit.status}
        </Text>
        {visit.addressText ? (
          <Text style={styles.address} numberOfLines={2}>
            {visit.addressText}
          </Text>
        ) : null}
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 8,
  },
  highlight: {
    borderWidth: 2,
    borderColor: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.08)",
  },
  title: { fontWeight: "600", fontSize: 17 },
  meta: { opacity: 0.7, marginTop: 4, fontSize: 14 },
  address: { opacity: 0.65, marginTop: 6, fontSize: 13, lineHeight: 18 },
  chev: { fontSize: 24, opacity: 0.4, marginLeft: 8 },
  pressed: { opacity: 0.72 },
});
