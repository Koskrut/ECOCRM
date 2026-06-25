import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { VisitCard } from "@/components/VisitCard";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { addDays, endOfLocalDayIso, startOfLocalDayIso } from "@/lib/date";
import { t } from "@/lib/i18n";
import { visitsApi } from "@/lib/api/visits";
import type { VisitSummary } from "@/types/crm";

type RangeKey = "7d" | "30d";

export default function VisitsHistoryScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [range, setRange] = useState<RangeKey>("7d");
  const [items, setItems] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromTo = useMemo(() => {
    const now = new Date();
    const days = range === "7d" ? 7 : 30;
    return {
      from: startOfLocalDayIso(addDays(now, -days)),
      to: endOfLocalDayIso(now),
    };
  }, [range]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await visitsApi.history(token, { from: fromTo.from, to: fromTo.to, page: 1, pageSize: 50 });
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

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Історія візитів</Text>

      <View style={styles.rangeRow}>
        {(
          [
            { key: "7d" as const, label: "7 днів" },
            { key: "30d" as const, label: "30 днів" },
          ] as const
        ).map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.chip, range === r.key && styles.chipActive]}
            accessibilityRole="button">
            <Text style={range === r.key ? styles.chipTextActive : undefined}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={items}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState message={error ?? (loading ? t("common.loading") : t("common.noData"))} onRetry={error ? reload : undefined} />
        }
        renderItem={({ item }) => (
          <VisitCard visit={item} onPress={() => router.push(`/visit/${item.id}`)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 10 },
  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipActive: { backgroundColor: "#dbeafe", borderColor: "#2563eb" },
  chipTextActive: { fontWeight: "600", color: "#1d4ed8" },
});

