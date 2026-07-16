import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { CompanyRow } from "@/components/CompanyRow";
import { ContactPickerPanel } from "@/components/visit/ContactPickerPanel";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { SearchField } from "@/components/ui/SearchField";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { companiesApi } from "@/lib/api/companies";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Company, Contact } from "@/types/crm";

type EntityKind = "contact" | "company";

type Props = {
  token: string;
  onSelectContact: (contact: Contact) => void;
  onSelectCompany: (company: Company) => void;
};

export function VisitEntityPickerPanel({ token, onSelectContact, onSelectCompany }: Props) {
  const theme = useTheme();
  const [kind, setKind] = useState<EntityKind>("contact");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [recent, setRecent] = useState<Company[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);

  useEffect(() => {
    if (kind !== "company") return;
    let cancelled = false;
    void (async () => {
      setLoadingLists(true);
      try {
        const listRes = await companiesApi.list(token, { pageSize: 30 });
        if (!cancelled) setRecent(listRes.items ?? []);
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, kind]);

  useEffect(() => {
    if (kind !== "company") return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await companiesApi.list(token, { search: q, pageSize: 30 });
          setResults(res.items ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [token, query, kind]);

  if (kind === "contact") {
    return (
      <View>
        <SegmentedControl
          options={[
            { value: "contact" as const, label: t("visits.entityContacts") },
            { value: "company" as const, label: t("visits.entityCompanies") },
          ]}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setQuery("");
            setResults([]);
          }}
        />
        <ContactPickerPanel token={token} onSelect={onSelectContact} />
      </View>
    );
  }

  const isSearch = query.trim().length > 0;
  const list = isSearch ? results : recent;

  return (
    <View>
      <SegmentedControl
        options={[
          { value: "contact" as const, label: t("visits.entityContacts") },
          { value: "company" as const, label: t("visits.entityCompanies") },
        ]}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setQuery("");
          setResults([]);
        }}
      />
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
        {t("visits.selectCompanyHint")}
      </Text>
      <SearchField value={query} onChangeText={setQuery} placeholder={t("companies.searchHint")} />

      {searching || loadingLists ? (
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : list.length === 0 ? (
        <EmptyState message={isSearch ? t("companies.emptySearch") : t("companies.empty")} />
      ) : (
        <>
          {!isSearch ? <SectionTitle title={t("visits.recentCompanies")} /> : null}
          {list.map((c, index) => (
            <CompanyRow key={c.id} company={c} index={index} onPress={() => onSelectCompany(c)} />
          ))}
        </>
      )}
    </View>
  );
}
