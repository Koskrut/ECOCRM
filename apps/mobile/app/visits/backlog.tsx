import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { VisitCard } from "@/components/VisitCard";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { visitsApi } from "@/lib/api/visits";
import { t } from "@/lib/i18n";
import type { VisitSummary } from "@/types/crm";

export default function VisitsBacklogScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await visitsApi.backlog(token);
      setItems(res.items ?? []);
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

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Беклог</Text>
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
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
});

