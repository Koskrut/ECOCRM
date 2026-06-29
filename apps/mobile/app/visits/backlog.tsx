import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { VisitCard } from "@/components/VisitCard";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
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
          </AnimatedListItem>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  item: { marginBottom: 8 },
});
