import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { ContactRow } from "@/components/ContactRow";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { SearchField } from "@/components/ui/SearchField";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { contactsApi } from "@/lib/api/contacts";
import { contactsWorkQueueApi } from "@/lib/api/contacts-work-queue";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Contact } from "@/types/crm";

type Props = {
  token: string;
  onSelect: (contact: Contact) => void;
  companyId?: string;
  companyName?: string;
  createContactLabel?: string;
};

export function ContactPickerPanel({
  token,
  onSelect,
  companyId,
  companyName,
  createContactLabel,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [recent, setRecent] = useState<Contact[]>([]);
  const [attentionContacts, setAttentionContacts] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);
  const [showAllRecent, setShowAllRecent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingLists(true);
      try {
        if (companyId) {
          const listRes = await contactsApi.list(token, { companyId, pageSize: 50 });
          if (!cancelled) setRecent(listRes.items ?? []);
          return;
        }
        const [listRes, queueRes] = await Promise.all([
          contactsApi.list(token, { pageSize: 30 }),
          contactsWorkQueueApi.list(token, { preset: "attention", pageSize: 8 }).catch(() => null),
        ]);
        if (cancelled) return;
        setRecent(listRes.items ?? []);
        const ids = (queueRes?.items ?? []).map((i) => i.contact.id);
        if (ids.length > 0) {
          const loaded = await Promise.all(
            ids.slice(0, 8).map((id) => contactsApi.getById(token, id).catch(() => null)),
          );
          if (!cancelled) {
            setAttentionContacts(loaded.filter((c): c is Contact => c != null));
          }
        }
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, companyId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = companyId
            ? await contactsApi.list(token, { companyId, q, pageSize: 30 })
            : await contactsApi.search(token, q);
          setResults(res.items ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [token, query, companyId]);

  const isSearch = query.trim().length > 0;
  const recentVisible = showAllRecent ? recent : recent.slice(0, 8);
  const hint = companyId ? t("orderCreate.selectClientHint") : t("visits.selectClientHint");

  return (
    <View>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
        {hint}
      </Text>
      {companyName ? (
        <Text style={[theme.typography.caption, { color: theme.colors.primary, marginBottom: theme.spacing.sm }]}>
          {companyName}
        </Text>
      ) : null}
      <SearchField value={query} onChangeText={setQuery} placeholder={t("clients.searchHint")} />

      {searching ? (
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <SkeletonCard />
        </View>
      ) : null}

      {isSearch ? (
        <>
          {results.length === 0 && !searching ? <EmptyState message={t("clients.empty")} /> : null}
          {results.map((c, index) => (
            <ContactRow key={c.id} contact={c} index={index} onPress={() => onSelect(c)} />
          ))}
        </>
      ) : loadingLists ? (
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <>
          {!companyId && attentionContacts.length > 0 ? (
            <>
              <SectionTitle title={t("visits.attentionClients")} />
              {attentionContacts.map((c, index) => (
                <ContactRow key={c.id} contact={c} index={index} onPress={() => onSelect(c)} />
              ))}
            </>
          ) : null}

          {recentVisible.length > 0 ? (
            <>
              <SectionTitle
                title={companyId ? t("companies.contacts") : t("visits.recentClients")}
              />
              {recentVisible.map((c, index) => (
                <ContactRow key={c.id} contact={c} index={index} onPress={() => onSelect(c)} />
              ))}
              {recent.length > 8 && !showAllRecent ? (
                <AppButton
                  label={t("visits.browseClients")}
                  onPress={() => setShowAllRecent(true)}
                  variant="ghost"
                  style={{ alignSelf: "flex-start", marginBottom: theme.spacing.sm }}
                />
              ) : null}
            </>
          ) : (
            <EmptyState message={t("clients.empty")} />
          )}
        </>
      )}

      <AppButton
        label={createContactLabel ?? t("contacts.createContact")}
        onPress={() =>
          router.push(companyId ? `/contacts/new?companyId=${encodeURIComponent(companyId)}` : "/contacts/new")
        }
        variant="secondary"
        fullWidth
        style={{ marginTop: theme.spacing.sm }}
      />
    </View>
  );
}
