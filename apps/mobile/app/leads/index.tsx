import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { SearchField } from "@/components/ui/SearchField";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAuth } from "@/context/auth-context";
import { leadsApi, type Lead } from "@/lib/api/leads";
import { useTheme } from "@/lib/design/theme-context";
import { leadStatusLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

const STATUS_FILTERS = ["", "NEW", "IN_PROGRESS", "WON", "LOST"] as const;

export default function LeadsListScreen() {
  const router = useRouter();
  const theme = useTheme();
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
    <Screen padded={false} contentStyle={styles.screen}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <AppHeader
          title={t("leads.title")}
          actionLabel={t("leads.addLead")}
          onAction={() => router.push("/leads/new")}
          large={false}
        />
        <SearchField value={q} onChangeText={setQ} placeholder={t("common.search")} />
        <View style={styles.filters}>
          {STATUS_FILTERS.map((s) => (
            <Chip
              key={s || "all"}
              label={s ? leadStatusLabel(s) : t("common.all")}
              selected={status === s}
              onPress={() => setStatus(s)}
            />
          ))}
        </View>
      </View>
      <FlatList
        data={items}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState message={error ?? t("leads.empty")} onRetry={error ? reload : undefined} />
        }
        renderItem={({ item, index }) => {
          const name =
            item.name ??
            [item.firstName, item.lastName].filter(Boolean).join(" ") ??
            item.phone ??
            "—";
          return (
            <AnimatedListItem index={index} style={styles.cardWrap}>
              <Card onPress={() => router.push(`/leads/${item.id}`)}>
                <View style={styles.row}>
                  <Text style={[theme.typography.bodyMedium, styles.name]}>{name}</Text>
                  <StatusPill label={leadStatusLabel(item.status)} tone="info" />
                </View>
                {item.phone ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                    {item.phone}
                  </Text>
                ) : null}
                {item.companyName ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                    {item.companyName}
                  </Text>
                ) : null}
              </Card>
            </AnimatedListItem>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  cardWrap: { marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" },
  name: { flex: 1 },
});
