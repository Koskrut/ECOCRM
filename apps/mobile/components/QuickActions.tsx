import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
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
  const theme = useTheme();

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Pressable
        onPress={() => void openPhone(phone)}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: theme.colors.primaryMuted },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button">
        <Text style={[styles.btnText, { color: theme.colors.primaryText }]}>{t("actions.call")}</Text>
      </Pressable>
      <Pressable
        onPress={() => void openNavigation({ token, date, visitId, lat, lng })}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: theme.colors.successMuted },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button">
        <Text style={[styles.btnText, { color: theme.colors.successText }]}>{t("actions.navigate")}</Text>
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
  btnText: { fontWeight: "600", fontSize: 14 },
  pressed: { opacity: 0.75 },
});
