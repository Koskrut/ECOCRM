import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/today/SectionHeader";
import { VisitCard } from "@/components/VisitCard";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { useTeamVisitFilter } from "@/hooks/use-team-visit-filter";
import { addDays, endOfLocalDayIso, startOfLocalDayIso } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { visitsApi } from "@/lib/api/visits";
import {
  groupVisitsByDay,
  groupVisitsByDayAndOwner,
  visitOwnerLabel,
  type VisitHistorySection,
} from "@/lib/visit-history";
import type { VisitSummary } from "@/types/crm";

type RangeKey = "7d" | "30d";

export default function VisitsHistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token, user } = useAuth();
  const [range, setRange] = useState<RangeKey>("7d");
  const [items, setItems] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isTeamLead, showTeamSections } = useTeamVisitFilter(token, user, items);

  const fromTo = useMemo(() => {
    const now = new Date();
    const days = range === "7d" ? 7 : 30;
    return {
      from: startOfLocalDayIso(addDays(now, -days)),
      to: endOfLocalDayIso(now),
    };
  }, [range]);

  const sections = useMemo((): VisitHistorySection[] => {
    if (showTeamSections && user?.id) {
      return groupVisitsByDayAndOwner(items, user.id);
    }
    return groupVisitsByDay(items);
  }, [items, showTeamSections, user?.id]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await visitsApi.history(token, {
        from: fromTo.from,
        to: fromTo.to,
        page: 1,
        pageSize: 100,
      });
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, fromTo.from, fromTo.to]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const ranges = [
    { key: "7d" as const, label: t("visits.range7d") },
    { key: "30d" as const, label: t("visits.range30d") },
  ];

  function openDayMap(section: VisitHistorySection) {
    const qs = section.ownerId ? `?ownerId=${encodeURIComponent(section.ownerId)}` : "";
    router.push(`/map/${section.dateKey}${qs}`);
  }

  return (
    <Screen padded={false} contentStyle={styles.screen}>
      <View
        style={[
          styles.rangeRow,
          { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
        ]}>
        {ranges.map((r) => (
          <Chip
            key={r.key}
            label={r.label}
            selected={range === r.key}
            onPress={() => setRange(r.key)}
          />
        ))}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        ListEmptyComponent={
          <EmptyState
            message={error ?? (loading ? t("common.loading") : t("common.noData"))}
            onRetry={error ? reload : undefined}
          />
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader
            title={section.title}
            actionLabel={t("visits.openDayMap")}
            onAction={() => openDayMap(section)}
          />
        )}
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index} style={styles.item}>
            <VisitCard
              visit={item}
              onPress={() => router.push(`/visit/${item.id}`)}
              ownerLabel={
                isTeamLead && user?.id ? visitOwnerLabel(item, user.id) : null
              }
            />
          </AnimatedListItem>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  item: { marginBottom: 8 },
});
