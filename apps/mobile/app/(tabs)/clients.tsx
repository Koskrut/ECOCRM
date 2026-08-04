import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { CompanyRow } from "@/components/CompanyRow";
import { ContactRow } from "@/components/ContactRow";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { AppHeader } from "@/components/ui/AppHeader";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/auth-context";
import { companiesApi } from "@/lib/api/companies";
import { contactsApi } from "@/lib/api/contacts";
import {
  CONTACT_WORK_QUEUE_PRESETS,
  contactsWorkQueueApi,
  type ContactWorkQueuePreset,
} from "@/lib/api/contacts-work-queue";
import { formatLocalDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { workQueuePresetLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";
import { openNavigation, openPhone } from "@/lib/linking-actions";
import type { Company, Contact } from "@/types/crm";

type Segment = "contacts" | "companies";
type ContactMode = "search" | "browse" | ContactWorkQueuePreset;

export default function ClientsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();
  const [segment, setSegment] = useState<Segment>("contacts");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [contactMode, setContactMode] = useState<ContactMode>("browse");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateKey = formatLocalDateKey();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (debounced) setContactMode("search");
  }, [debounced]);

  const reloadContacts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (contactMode === "search" && debounced) {
        const res = await contactsApi.search(token, debounced);
        setContacts(res.items ?? []);
      } else if (contactMode === "browse") {
        const res = await contactsApi.list(token, { pageSize: 40 });
        setContacts(res.items ?? []);
      } else if (contactMode !== "search") {
        const res = await contactsWorkQueueApi.list(token, { preset: contactMode, pageSize: 40 });
        setContacts(
          res.items.map((row) => ({
            id: row.contact.id,
            firstName: row.contact.fullName.split(" ")[0] ?? "",
            lastName: row.contact.fullName.split(" ").slice(1).join(" ") ?? "",
            phone: row.contact.phone ?? "",
            clientStage: row.contact.clientStage as Contact["clientStage"],
            status: row.contact.status,
            company: row.contact.companyName ? { id: "", name: row.contact.companyName } : null,
          })),
        );
      } else {
        setContacts([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [token, debounced, contactMode]);

  const reloadCompanies = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await companiesApi.list(token, {
        search: debounced || undefined,
        pageSize: 40,
      });
      setCompanies(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [token, debounced]);

  const reload = useCallback(async () => {
    if (segment === "contacts") await reloadContacts();
    else await reloadCompanies();
  }, [segment, reloadContacts, reloadCompanies]);

  useEffect(() => {
    void reload();
  }, [segment, debounced, contactMode, reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const contactPresets: Array<{ key: ContactMode; label: string }> = useMemo(
    () => [
      { key: "browse", label: t("clients.browseAll") },
      ...CONTACT_WORK_QUEUE_PRESETS.map((p) => ({
        key: p as ContactMode,
        label: workQueuePresetLabel(p),
      })),
    ],
    [],
  );

  const activeFilterLabel = useMemo(() => {
    if (contactMode === "search") return t("common.search");
    return contactPresets.find((p) => p.key === contactMode)?.label ?? t("clients.browseAll");
  }, [contactMode, contactPresets]);

  const searchPlaceholder =
    segment === "contacts" ? t("clients.searchHint") : t("companies.searchHint");

  const emptyMessage = (() => {
    if (error) return error;
    if (segment === "contacts") {
      return contactMode === "search" && !debounced ? t("clients.emptySearch") : t("clients.empty");
    }
    return debounced ? t("companies.emptySearch") : t("companies.empty");
  })();

  const showSkeleton = loading && (segment === "contacts" ? contacts.length === 0 : companies.length === 0);

  const listHeader = (
    <View style={styles.headerBlock}>
      <SegmentedControl
        options={[
          { value: "contacts", label: t("clients.segContacts") },
          { value: "companies", label: t("clients.segCompanies") },
        ]}
        value={segment}
        onChange={(next) => {
          setSegment(next);
          setQuery("");
          setDebounced("");
          setFiltersOpen(false);
          if (next === "contacts") setContactMode("browse");
        }}
      />

      <SearchField value={query} onChangeText={setQuery} placeholder={searchPlaceholder} />

      <View style={[styles.toolbar, { marginBottom: filtersOpen ? theme.spacing.sm : 0 }]}>
        <Pressable
          onPress={() => setFiltersOpen((v) => !v)}
          accessibilityRole="button"
          style={[
            styles.filterToggle,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: filtersOpen || (segment === "contacts" && contactMode !== "browse")
                ? theme.colors.primary
                : theme.colors.border,
            },
          ]}>
          <Ionicons
            name="options-outline"
            size={16}
            color={theme.colors.text}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.filterToggleText, { color: theme.colors.text }]} numberOfLines={1}>
            {segment === "contacts"
              ? `${t("clients.filters")}: ${activeFilterLabel}`
              : t("clients.filters")}
          </Text>
          <Ionicons
            name={filtersOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.colors.textMuted}
            style={{ marginLeft: 4 }}
          />
        </Pressable>
        <Chip label={t("leads.title")} onPress={() => router.push("/leads")} />
        <Chip label={t("clients.newOrder")} onPress={() => router.push("/orders/new")} />
      </View>

      {filtersOpen && segment === "contacts" ? (
        <View style={styles.filtersWrap}>
          {contactPresets.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={contactMode === p.key}
              onPress={() => {
                setContactMode(p.key);
                if (p.key !== "search") setQuery("");
                setFiltersOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <AppHeader
        title={t("clients.title")}
        actionLabel={segment === "contacts" ? t("clients.addContact") : t("companies.add")}
        onAction={() =>
          router.push(segment === "contacts" ? "/contacts/new" : "/companies/new")
        }
        large={false}
      />

      {showSkeleton ? (
        <View style={{ flex: 1 }}>
          {listHeader}
          <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        </View>
      ) : segment === "contacts" ? (
        <FlatList
          data={contacts}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reloadContacts} tintColor={theme.colors.primary} />
          }
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState message={emptyMessage} onRetry={error ? reloadContacts : undefined} />
          }
          renderItem={({ item, index }) => (
            <ContactRow
              contact={item}
              index={index}
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
      ) : (
        <FlatList
          data={companies}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reloadCompanies} tintColor={theme.colors.primary} />
          }
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState message={emptyMessage} onRetry={error ? reloadCompanies : undefined} />
          }
          renderItem={({ item, index }) => (
            <CompanyRow
              company={item}
              index={index}
              onPress={() => router.push(`/company/${item.id}`)}
              onCall={item.phone ? () => void openPhone(item.phone) : undefined}
              onNavigate={
                item.lat != null && item.lng != null
                  ? () =>
                      void openNavigation({
                        token: token!,
                        date: dateKey,
                        lat: item.lat,
                        lng: item.lng,
                      })
                  : undefined
              }
              onOrder={() => router.push(`/orders/new?companyId=${encodeURIComponent(item.id)}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    flexShrink: 0,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 140,
  },
  filterToggleText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  filtersWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: 16 },
});
