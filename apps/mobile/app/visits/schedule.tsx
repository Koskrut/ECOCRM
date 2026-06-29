import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { VisitCard } from "@/components/VisitCard";
import { SectionHeader } from "@/components/today/SectionHeader";
import { TeamVisitFilter } from "@/components/visit/TeamVisitFilter";
import { VisitMonthCalendar } from "@/components/visit/VisitMonthCalendar";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { useTeamVisitFilter } from "@/hooks/use-team-visit-filter";
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

type VisitSection = {
  key: string;
  title: string;
  data: VisitSummary[];
};

export default function VisitScheduleScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token, user } = useAuth();
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

  const {
    isTeamLead,
    viewOwnerId,
    setViewOwnerId,
    teamMembers,
    showTeamSections,
    teamGroups,
  } = useTeamVisitFilter(token, user, visits);

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
          const items = await visitsApi.day(token, dateKey, viewOwnerId || undefined);
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
  }, [token, monthDayKeys, viewOwnerId]);

  const loadDay = useCallback(async () => {
    if (!token) return;
    setLoadingDay(true);
    setError(null);
    try {
      const items = await visitsApi.day(token, selectedDateKey, viewOwnerId || undefined);
      setVisits(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setVisits([]);
    } finally {
      setLoadingDay(false);
    }
  }, [token, selectedDateKey, viewOwnerId]);

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

  const sections = useMemo((): VisitSection[] => {
    if (showTeamSections && teamGroups) {
      return teamGroups.map((group) => ({
        key: group.ownerId,
        title:
          group.ownerId === user?.id
            ? t("today.myVisitsSection")
            : t("today.teamVisitsSection", { name: group.ownerName }),
        data: group.visits,
      }));
    }
    return [{ key: "day", title: "", data: visits }];
  }, [showTeamSections, teamGroups, visits, user?.id]);

  const refreshing = loadingDay || loadingMonth;

  const listHeader = (
    <View>
      <VisitMonthCalendar
        monthAnchorKey={monthAnchorKey}
        selectedDateKey={selectedDateKey}
        visitCounts={visitCounts}
        onMonthChange={setMonthAnchorKey}
        onSelectDate={onSelectDate}
      />
      {isTeamLead ? (
        <TeamVisitFilter
          userId={user?.id}
          viewOwnerId={viewOwnerId}
          teamMembers={teamMembers}
          showTeamSections={showTeamSections}
          onViewOwnerIdChange={setViewOwnerId}
        />
      ) : null}
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
  );

  return (
    <Screen padded={false} contentStyle={styles.flex}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
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
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loadingDay ? null : (
            <EmptyState
              message={error ?? t("today.empty")}
              onRetry={error ? () => void loadDay() : undefined}
            />
          )
        }
        renderSectionHeader={({ section }) =>
          showTeamSections && section.title ? (
            <SectionHeader title={section.title} />
          ) : null
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
