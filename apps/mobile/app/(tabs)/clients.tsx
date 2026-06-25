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
import {
  CONTACT_WORK_QUEUE_PRESETS,
  contactsWorkQueueApi,
  type ContactWorkQueuePreset,
} from "@/lib/api/contacts-work-queue";
import { colors, spacing } from "@/lib/design/tokens";
import { formatLocalDateKey } from "@/lib/date";
import { workQueuePresetLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";
import { openNavigation, openPhone } from "@/lib/linking-actions";
import type { Contact } from "@/types/crm";

type Mode = "search" | "browse" | ContactWorkQueuePreset;

export default function ClientsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mode, setMode] = useState<Mode>("browse");
  const [items, setItems] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateKey = formatLocalDateKey();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (debounced) setMode("search");
  }, [debounced]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "search" && debounced) {
        const res = await contactsApi.search(token, debounced);
        setItems(res.items ?? []);
      } else if (mode === "browse") {
        const res = await contactsApi.list(token, { pageSize: 40 });
        setItems(res.items ?? []);
      } else if (mode !== "search") {
        const res = await contactsWorkQueueApi.list(token, { preset: mode, pageSize: 40 });
        setItems(res.items.map((row) => ({
          id: row.contact.id,
          firstName: row.contact.fullName.split(" ")[0] ?? "",
          lastName: row.contact.fullName.split(" ").slice(1).join(" ") ?? "",
          phone: row.contact.phone ?? "",
          clientStage: row.contact.clientStage as Contact["clientStage"],
          status: row.contact.status,
          company: row.contact.companyName
            ? { id: "", name: row.contact.companyName }
            : null,
        })));
      } else {
        setItems([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, debounced, mode]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const presets: Array<{ key: Mode; label: string }> = [
    { key: "browse", label: t("clients.browseAll") },
    ...CONTACT_WORK_QUEUE_PRESETS.map((p) => ({ key: p as Mode, label: workQueuePresetLabel(p) })),
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("clients.title")}
        actionLabel="+ Контакт"
        onAction={() => router.push("/contacts/new")}
      />

      <View style={styles.quickRow}>
        <Pressable
          onPress={() => router.push("/leads")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.quickBtnText}>{t("leads.title")}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/orders/new")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.quickBtnText}>+ Замовлення</Text>
        </Pressable>
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t("clients.searchHint")}
      />

      <View style={styles.presetRow}>
        {presets.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => {
              setMode(p.key);
              if (p.key !== "search") setQuery("");
            }}
            style={[styles.presetChip, mode === p.key && styles.presetChipOn]}
            accessibilityRole="button">
            <Text style={mode === p.key ? styles.presetTextOn : styles.presetText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={items}
        style={{ marginTop: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            message={
              error ??
              (mode === "search" && !debounced ? t("clients.emptySearch") : t("clients.empty"))
            }
            onRetry={error ? reload : undefined}
          />
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
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  presetText: { fontSize: 13, opacity: 0.8 },
  presetTextOn: { fontSize: 13, fontWeight: "700", color: colors.primaryText },
});
