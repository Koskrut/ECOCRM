import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { Text } from "@/components/Themed";
import { useActiveWork } from "@/context/active-work-context";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export function ActiveWorkBanner() {
  const router = useRouter();
  const theme = useTheme();
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
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors.callMuted,
            borderBottomColor: theme.colors.border,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
          },
        ]}
        accessibilityRole="button">
        <Text style={[theme.typography.bodyMedium, styles.text]}>
          📞 {t("activeWork.call", { label: callSessionLabel ?? t("activeWork.callActive") })}
        </Text>
        <Text style={[styles.chev, { color: theme.colors.textMuted }]}>›</Text>
      </Pressable>
    );
  }

  if (activeVisitId) {
    return (
      <Pressable
        onPress={() => router.push(`/visit/${activeVisitId}`)}
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors.visitMuted,
            borderBottomColor: theme.colors.border,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
          },
        ]}
        accessibilityRole="button">
        <Text style={[theme.typography.bodyMedium, styles.text]}>
          📍 {t("activeWork.visit", { label: activeVisitLabel ?? t("activeWork.visitActive") })}
        </Text>
        <Text style={[styles.chev, { color: theme.colors.textMuted }]}>›</Text>
      </Pressable>
    );
  }

  if (orderDraftLabel) {
    return (
      <Pressable
        onPress={() => router.push("/orders/new")}
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors.orderMuted,
            borderBottomColor: theme.colors.border,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
          },
        ]}
        accessibilityRole="button">
        <Text style={[theme.typography.bodyMedium, styles.text]}>
          🛒 {t("activeWork.orderDraft", { label: orderDraftLabel })}
        </Text>
        <Text style={[styles.chev, { color: theme.colors.textMuted }]}>›</Text>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
  chev: { fontSize: 20 },
});
