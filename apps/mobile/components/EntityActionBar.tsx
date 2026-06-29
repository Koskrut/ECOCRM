import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { manualCallingApi } from "@/lib/api/manual-calling";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { openNavigation, openPhone } from "@/lib/linking-actions";

type Props = {
  token: string;
  date: string;
  phone?: string | null;
  visitId?: string;
  contactId?: string;
  leadId?: string;
  lat?: number | null;
  lng?: number | null;
  compact?: boolean;
};

export function EntityActionBar({
  token,
  date,
  phone,
  visitId,
  contactId,
  leadId,
  lat,
  lng,
  compact,
}: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { manualCallingEnabled } = useModules();

  async function onEnqueueCall() {
    try {
      if (leadId) await manualCallingApi.enqueue(token, { leadId });
      else if (contactId) await manualCallingApi.enqueue(token, { contactId });
      else return;
      Alert.alert(t("common.done"), t("actions.enqueuedCall"));
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    }
  }

  const btnStyle = (bg: string) => ({
    backgroundColor: bg,
    borderRadius: theme.radius.md,
    minHeight: theme.layout.minTouchTarget,
  });

  return (
    <View style={[styles.row, compact && styles.compact, { gap: theme.spacing.sm, marginTop: compact ? 0 : theme.spacing.sm }]}>
      <Pressable
        onPress={() => void openPhone(phone)}
        style={({ pressed }) => [styles.btn, btnStyle(theme.colors.callMuted), pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.emoji}>📞</Text>
      </Pressable>
      <Pressable
        onPress={() => void openNavigation({ token, date, visitId, lat, lng })}
        style={({ pressed }) => [styles.btn, btnStyle(theme.colors.visitMuted), pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.emoji}>🗺</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          const q = contactId ? `?contactId=${contactId}` : "";
          router.push(`/orders/new${q}`);
        }}
        style={({ pressed }) => [styles.btn, btnStyle(theme.colors.orderMuted), pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.emoji}>🛒</Text>
      </Pressable>
      {manualCallingEnabled && (contactId || leadId) ? (
        <Pressable
          onPress={() => void onEnqueueCall()}
          style={({ pressed }) => [styles.btn, btnStyle(theme.colors.chip), pressed && styles.pressed]}
          accessibilityRole="button">
          <Text style={styles.emoji}>📋</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  compact: { marginTop: 0 },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 18 },
  pressed: { opacity: 0.75 },
});
