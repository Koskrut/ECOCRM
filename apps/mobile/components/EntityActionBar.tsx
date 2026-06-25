import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { manualCallingApi } from "@/lib/api/manual-calling";
import { colors, layout, radius, spacing } from "@/lib/design/tokens";
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
  const { manualCallingEnabled } = useModules();

  async function onEnqueueCall() {
    try {
      if (leadId) await manualCallingApi.enqueue(token, { leadId });
      else if (contactId) await manualCallingApi.enqueue(token, { contactId });
      else return;
      Alert.alert(t("common.done"), "Додано в чергу дзвінків");
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={[styles.row, compact && styles.compact]}>
      <Pressable
        onPress={() => void openPhone(phone)}
        style={({ pressed }) => [styles.btn, styles.call, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.callText}>📞</Text>
      </Pressable>
      <Pressable
        onPress={() => void openNavigation({ token, date, visitId, lat, lng })}
        style={({ pressed }) => [styles.btn, styles.nav, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.navText}>🗺</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          const q = contactId ? `?contactId=${contactId}` : "";
          router.push(`/orders/new${q}`);
        }}
        style={({ pressed }) => [styles.btn, styles.order, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.orderText}>🛒</Text>
      </Pressable>
      {manualCallingEnabled && (contactId || leadId) ? (
        <Pressable
          onPress={() => void onEnqueueCall()}
          style={({ pressed }) => [styles.btn, styles.queue, pressed && styles.pressed]}
          accessibilityRole="button">
          <Text style={styles.queueText}>📋</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  compact: { marginTop: 0 },
  btn: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  call: { backgroundColor: colors.callMuted },
  callText: { fontSize: 18 },
  nav: { backgroundColor: colors.visitMuted },
  navText: { fontSize: 18 },
  order: { backgroundColor: colors.orderMuted },
  orderText: { fontSize: 18 },
  queue: { backgroundColor: colors.chip },
  queueText: { fontSize: 18 },
  pressed: { opacity: 0.75 },
});
