import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { Text } from "@/components/Themed";
import { useActiveWork } from "@/context/active-work-context";
import { colors, radius, spacing } from "@/lib/design/tokens";

export function ActiveWorkBanner() {
  const router = useRouter();
  const {
    activeVisitId,
    activeVisitLabel,
    callSessionId,
    callSessionLabel,
    orderDraftLabel,
  } = useActiveWork();

  if (callSessionId) {
    return (
      <Pressable
        onPress={() => router.push(`/calls/session?id=${callSessionId}`)}
        style={styles.banner}
        accessibilityRole="button">
        <Text style={styles.text}>📞 Дзвінок: {callSessionLabel ?? "активний"}</Text>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    );
  }

  if (activeVisitId) {
    return (
      <Pressable
        onPress={() => router.push(`/visit/${activeVisitId}`)}
        style={[styles.banner, styles.visit]}
        accessibilityRole="button">
        <Text style={styles.text}>📍 Візит: {activeVisitLabel ?? "активний"}</Text>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    );
  }

  if (orderDraftLabel) {
    return (
      <Pressable
        onPress={() => router.push("/orders/new")}
        style={[styles.banner, styles.order]}
        accessibilityRole="button">
        <Text style={styles.text}>🛒 Чернетка: {orderDraftLabel}</Text>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.callMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  visit: { backgroundColor: colors.visitMuted },
  order: { backgroundColor: colors.orderMuted },
  text: { fontWeight: "600", fontSize: 14, flex: 1 },
  chev: { fontSize: 20, opacity: 0.5 },
});
