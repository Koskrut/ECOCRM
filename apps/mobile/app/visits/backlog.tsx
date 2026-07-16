import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { VisitCard } from "@/components/VisitCard";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
import { VisitRescheduleSheet } from "@/components/visit/VisitRescheduleSheet";
import { useAuth } from "@/context/auth-context";
import { visitsApi } from "@/lib/api/visits";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { VisitSummary } from "@/types/crm";

export default function VisitsBacklogScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();
  const [items, setItems] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedulingVisit, setSchedulingVisit] = useState<VisitSummary | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await visitsApi.backlog(token);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function onSchedule(payload: { startsAt: string; endsAt: string; durationMin: number }) {
    if (!token || !schedulingVisit) return;
    setActionBusy(true);
    try {
      await visitsApi.update(token, schedulingVisit.id, {
        ...payload,
        status: "SCHEDULED",
      });
      setSchedulingVisit(null);
      Alert.alert(t("common.done"), t("visit.scheduledFromBacklog"));
      await reload();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <Screen padded={false} contentStyle={styles.screen}>
      <FlatList
        data={items}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ marginBottom: theme.spacing.md }}>
            <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
              {t("visits.backlogHint")}
            </Text>
            <AppButton
              label={t("visits.addBacklog")}
              onPress={() => router.push("/visits/new?schedule=backlog")}
              variant="secondary"
              style={{ marginTop: theme.spacing.sm, alignSelf: "flex-start" }}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            message={error ?? (loading ? t("common.loading") : t("visits.backlogEmpty"))}
            onRetry={error ? reload : undefined}
          />
        }
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index} style={styles.item}>
            <VisitCard visit={item} onPress={() => router.push(`/visit/${item.id}`)} />
            <AppButton
              label={t("visit.scheduleFromBacklog")}
              onPress={() => setSchedulingVisit(item)}
              variant="secondary"
              style={{ marginTop: 4, alignSelf: "stretch" }}
            />
          </AnimatedListItem>
        )}
      />

      <VisitRescheduleSheet
        visible={schedulingVisit != null}
        onClose={() => setSchedulingVisit(null)}
        initialStartsAt={null}
        durationMin={schedulingVisit?.durationMin}
        loading={actionBusy}
        title={t("visit.scheduleFromBacklogTitle")}
        onSave={(payload) => void onSchedule(payload)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  item: { marginBottom: 12 },
});
