import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { ContactRow } from "@/components/ContactRow";
import { EmptyState } from "@/components/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchField } from "@/components/ui/SearchField";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { colors, spacing } from "@/lib/design/tokens";
import { formatLocalDateKey } from "@/lib/date";
import { t } from "@/lib/i18n";
import { openNavigation, openPhone } from "@/lib/linking-actions";
import type { Contact } from "@/types/crm";

export default function ClientsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateKey = formatLocalDateKey();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const reload = useCallback(async () => {
    if (!token) return;
    if (!debounced) {
      setItems([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await contactsApi.search(token, debounced);
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, debounced]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("clients.title")}
        actionLabel="+ Контакт"
        onAction={() => router.push("/contacts/new")}
      />

      <View style={styles.quickRow}>
        <Pressable
          onPress={() => router.push("/leads/new")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.quickBtnText}>+ Лід</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/orders/new")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.quickBtnText}>+ Замовлення</Text>
        </Pressable>
      </View>

      <SearchField value={query} onChangeText={setQuery} placeholder={t("clients.searchHint")} />

      <FlatList
        data={items}
        style={{ marginTop: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          error ? (
            <EmptyState message={error} onRetry={reload} />
          ) : (
            <EmptyState message={debounced ? t("clients.empty") : t("clients.emptySearch")} />
          )
        }
        renderItem={({ item }) => (
          <ContactRow
            contact={item}
            onPress={() => router.push(`/contact/${item.id}`)}
            onCall={() => void openPhone(item.phone)}
            onNavigate={() =>
              void openNavigation({
                token: token!,
                date: dateKey,
                lat: item.lat,
                lng: item.lng,
              })
            }
            onOrder={() => router.push(`/orders/new?contactId=${item.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  quickRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  quickBtn: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
  },
  quickBtnText: { color: colors.primaryText, fontWeight: "700" },
});
