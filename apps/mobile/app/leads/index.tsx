import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchField } from "@/components/ui/SearchField";
import { StatusPill } from "@/components/ui/StatusPill";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { leadsApi, type Lead } from "@/lib/api/leads";
import { spacing } from "@/lib/design/tokens";
import { leadStatusLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

const STATUS_FILTERS = ["", "NEW", "IN_PROGRESS", "WON", "LOST"] as const;

export default function LeadsListScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await leadsApi.list(token, {
        q: debounced || undefined,
        status: status || undefined,
        pageSize: 50,
      });
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, debounced, status]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("leads.title")}
        actionLabel="+ Лід"
        onAction={() => router.push("/leads/new")}
      />
      <SearchField value={q} onChangeText={setQ} placeholder={t("common.search")} />
      <View style={styles.filters}>
        {STATUS_FILTERS.map((s) => (
          <Pressable
            key={s || "all"}
            onPress={() => setStatus(s)}
            style={[styles.chip, status === s && styles.chipOn]}
            accessibilityRole="button">
            <Text style={status === s ? styles.chipTextOn : undefined}>
              {s ? leadStatusLabel(s) : "Усі"}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={items}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState message={error ?? t("leads.empty")} onRetry={error ? reload : undefined} />
        }
        renderItem={({ item }) => {
          const name =
            item.name ??
            [item.firstName, item.lastName].filter(Boolean).join(" ") ??
            item.phone ??
            "—";
          return (
            <Card onPress={() => router.push(`/leads/${item.id}`)} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{name}</Text>
                <StatusPill label={leadStatusLabel(item.status)} tone="info" />
              </View>
              {item.phone ? <Text style={styles.meta}>{item.phone}</Text> : null}
              {item.companyName ? <Text style={styles.meta}>{item.companyName}</Text> : null}
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipOn: { backgroundColor: "#dbeafe", borderColor: "#2563eb" },
  chipTextOn: { fontWeight: "700", color: "#1d4ed8" },
  card: { marginBottom: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  name: { fontWeight: "700", fontSize: 16, flex: 1 },
  meta: { marginTop: 4, opacity: 0.75, fontSize: 14 },
});
