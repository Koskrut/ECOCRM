import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { t } from "@/lib/i18n";
import { openNavigation, openPhone } from "@/lib/linking-actions";

type QuickActionsProps = {
  token: string;
  date: string;
  phone?: string | null;
  visitId?: string;
  lat?: number | null;
  lng?: number | null;
  compact?: boolean;
};

export function QuickActions({
  token,
  date,
  phone,
  visitId,
  lat,
  lng,
  compact,
}: QuickActionsProps) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Pressable
        onPress={() => void openPhone(phone)}
        style={({ pressed }) => [styles.btn, styles.btnCall, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.btnCallText}>{t("actions.call")}</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void openNavigation({ token, date, visitId, lat, lng })
        }
        style={({ pressed }) => [styles.btn, styles.btnNav, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.btnNavText}>{t("actions.navigate")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  rowCompact: { marginTop: 0 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  btnCall: { backgroundColor: "rgba(37,99,235,0.12)" },
  btnCallText: { color: "#1d4ed8", fontWeight: "600", fontSize: 14 },
  btnNav: { backgroundColor: "rgba(5,150,105,0.12)" },
  btnNavText: { color: "#047857", fontWeight: "600", fontSize: 14 },
  pressed: { opacity: 0.75 },
});
