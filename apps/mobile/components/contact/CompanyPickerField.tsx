import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SearchField } from "@/components/ui/SearchField";
import { companiesApi } from "@/lib/api/companies";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Company } from "@/types/crm";

type Props = {
  token: string;
  companyId: string | null;
  companyName: string | null;
  onChange: (company: { id: string; name: string } | null) => void;
  disabled?: boolean;
};

export function CompanyPickerField({
  token,
  companyId,
  companyName,
  onChange,
  disabled,
}: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const res = await companiesApi.list(token, { search: q.trim() || undefined, pageSize: 30 });
        setItems(res.items ?? []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(query), 250);
    return () => clearTimeout(timer);
  }, [open, query, load]);

  return (
    <View style={styles.wrap}>
      <Text style={[theme.typography.caption, styles.label]}>{t("clients.company")}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            opacity: disabled ? 0.6 : 1,
          },
        ]}>
        <Text
          style={[
            theme.typography.body,
            { color: companyId ? theme.colors.text : theme.colors.textMuted },
          ]}
          numberOfLines={1}>
          {companyName || t("clients.companyNone")}
        </Text>
      </Pressable>
      {companyId ? (
        <AppButton
          label={t("clients.clearCompany")}
          variant="ghost"
          onPress={() => onChange(null)}
          disabled={disabled}
          style={{ alignSelf: "flex-start", marginTop: 4 }}
        />
      ) : null}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={t("clients.company")}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t("companies.searchHint")}
        />
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} />
        ) : items.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: 12 }]}>
            {t("companies.emptySearch")}
          </Text>
        ) : (
          items.map((c) => {
            const active = c.id === companyId;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  onChange({ id: c.id, name: c.name });
                  setOpen(false);
                }}
                style={[
                  styles.option,
                  {
                    backgroundColor: active ? theme.colors.chipOn : "transparent",
                    borderColor: theme.colors.border,
                  },
                ]}>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text, fontWeight: active ? "700" : "400" },
                  ]}>
                  {c.name}
                </Text>
                {c.phone ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                    {c.phone}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    marginTop: 4,
  },
});
