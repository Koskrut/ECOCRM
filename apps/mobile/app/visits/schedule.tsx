import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { VisitCard } from "@/components/VisitCard";
import { VisitMonthCalendar } from "@/components/visit/VisitMonthCalendar";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { visitsApi } from "@/lib/api/visits";
import {
  daysInMonth,
  formatHumanDate,
  formatLocalDateKey,
  parseDateKey,
} from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { VisitSummary } from "@/types/crm";

export default function VisitScheduleScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ date?: string }>();
  const initialDate =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : formatLocalDateKey();

  const [selectedDateKey, setSelectedDateKey] = useState(initialDate);
  const [monthAnchorKey, setMonthAnchorKey] = useState(initialDate);
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthDayKeys = useMemo(() => {
    const d = parseDateKey(monthAnchorKey);
    const year = d.getFullYear();
    const month = d.getMonth();
    const total = daysInMonth(year, month);
    return Array.from({ length: total }, (_, i) =>
      formatLocalDateKey(new Date(year, month, i + 1)),
    );
  }, [monthAnchorKey]);

  const loadMonthCounts = useCallback(async () => {
    if (!token) return;
    setLoadingMonth(true);
    try {
      const pairs = await Promise.all(
        monthDayKeys.map(async (dateKey) => {
          const items = await visitsApi.day(token, dateKey);
          return [dateKey, items.length] as const;
        }),
      );
      const next: Record<string, number> = {};
      for (const [key, count] of pairs) {
        if (count > 0) next[key] = count;
      }
      setVisitCounts(next);
    } catch {
      // keep previous dots
    } finally {
      setLoadingMonth(false);
    }
  }, [token, monthDayKeys]);

  const loadDay = useCallback(async () => {
    if (!token) return;
    setLoadingDay(true);
    setError(null);
    try {
      const items = await visitsApi.day(token, selectedDateKey);
      setVisits(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setVisits([]);
    } finally {
      setLoadingDay(false);
    }
  }, [token, selectedDateKey]);

  useEffect(() => {
    void loadMonthCounts();
  }, [loadMonthCounts]);

  useFocusEffect(
    useCallback(() => {
      void loadDay();
    }, [loadDay]),
  );

  function onSelectDate(dateKey: string) {
    setSelectedDateKey(dateKey);
    setMonthAnchorKey(dateKey);
  }

  const refreshing = loadingDay || loadingMonth;

  return (
    <Screen padded={false} contentStyle={styles.flex}>
      <FlatList
        data={visits}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadMonthCounts();
              void loadDay();
            }}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <VisitMonthCalendar
              monthAnchorKey={monthAnchorKey}
              selectedDateKey={selectedDateKey}
              visitCounts={visitCounts}
              onMonthChange={setMonthAnchorKey}
              onSelectDate={onSelectDate}
            />
            <AppButton
              label={t("visits.addForDay")}
              onPress={() => router.push(`/visits/new?schedule=today&date=${selectedDateKey}`)}
              variant="secondary"
              style={{ marginBottom: theme.spacing.md, alignSelf: "flex-start" }}
            />
            <Text style={[theme.typography.section, { marginBottom: theme.spacing.sm }]}>
              {formatHumanDate(parseDateKey(selectedDateKey))}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loadingDay ? null : (
            <EmptyState
              message={error ?? t("today.empty")}
              onRetry={error ? () => void loadDay() : undefined}
            />
          )
        }
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index} style={styles.item}>
            <VisitCard visit={item} onPress={() => router.push(`/visit/${item.id}`)} />
          </AnimatedListItem>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { marginBottom: 8 },
});
