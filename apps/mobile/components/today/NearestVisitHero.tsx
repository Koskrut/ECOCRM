import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { EntityActionBar } from "@/components/EntityActionBar";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  visitCountdownLabel,
  visitLabel,
  visitPhone,
  visitTimeRange,
} from "@/lib/visit-utils";
import type { VisitSummary } from "@/types/crm";

type Props = {
  visit: VisitSummary;
  token: string;
  dateKey: string;
};

export function NearestVisitHero({ visit, token, dateKey }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const countdown = visitCountdownLabel(visit);

  return (
    <LinearGradient
      colors={[theme.colors.visitMuted, theme.colors.primaryMuted]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { borderRadius: theme.radius.lg, marginBottom: theme.spacing.md }]}>
      <Card
        style={{
          backgroundColor: theme.colors.surfaceGlass,
          borderColor: theme.colors.primary,
          borderWidth: StyleSheet.hairlineWidth,
        }}>
        <View style={styles.topRow}>
          <Text style={[theme.typography.label, { color: theme.colors.primaryText }]}>
            {t("today.nearestVisit")}
          </Text>
          {countdown ? <StatusPill label={countdown} tone="warning" /> : null}
        </View>
        <Text style={[theme.typography.title, { marginTop: theme.spacing.sm }]}>{visitLabel(visit)}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.xs }]}>
          {visitTimeRange(visit)}
          {visitTimeRange(visit) ? " · " : ""}
          {visit.status}
        </Text>
        {visit.addressText ? (
          <Text
            style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}
            numberOfLines={2}>
            {visit.addressText}
          </Text>
        ) : null}
        <EntityActionBar
          token={token}
          date={dateKey}
          phone={visitPhone(visit)}
          visitId={visit.id}
          contactId={visit.contactId ?? visit.contact?.id}
          lat={visit.lat}
          lng={visit.lng}
          compact
        />
        <Pressable
          onPress={() => router.push(`/visit/${visit.id}`)}
          style={({ pressed }) => [styles.open, pressed && { opacity: 0.8 }]}
          accessibilityRole="button">
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.primary }]}>
            {t("visit.title")} ›
          </Text>
        </Pressable>
      </Card>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 1 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  open: { marginTop: 10, alignSelf: "flex-start" },
});
