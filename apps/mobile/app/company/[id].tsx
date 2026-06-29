import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { ContactRow } from "@/components/ContactRow";
import { EntityActionBar } from "@/components/EntityActionBar";
import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useAuth } from "@/context/auth-context";
import { companiesApi } from "@/lib/api/companies";
import { contactsApi } from "@/lib/api/contacts";
import { ordersApi } from "@/lib/api/orders";
import { formatLocalDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Company, CompanyAddress, Contact, Order } from "@/types/crm";

function Field({
  label,
  value,
  theme,
}: {
  label: string;
  value: string | null | undefined;
  theme: ReturnType<typeof useTheme>;
}) {
  if (!value?.trim()) return null;
  return (
    <View style={{ marginTop: theme.spacing.md }}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, textTransform: "uppercase" }]}>
        {label}
      </Text>
      <Text style={[theme.typography.body, { marginTop: 4, lineHeight: 22 }]}>{value}</Text>
    </View>
  );
}

export default function CompanyDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const companyId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();
  const dateKey = formatLocalDateKey();

  const [company, setCompany] = useState<Company | null>(null);
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !companyId) {
      setCompany(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const c = await companiesApi.getById(token, companyId);
      setCompany(c);

      const [addrRes, contactsRes, ordersRes] = await Promise.all([
        companiesApi.getAddresses(token, companyId).catch(() => ({ items: [] as CompanyAddress[] })),
        contactsApi.list(token, { companyId, pageSize: 50 }).catch(() => ({
          items: [] as Contact[],
          total: 0,
          page: 1,
          pageSize: 50,
        })),
        ordersApi.list(token, { companyId, page: 1, pageSize: 10 }).catch(() => ({
          items: [] as Order[],
          total: 0,
          page: 1,
          pageSize: 10,
        })),
      ]);

      setAddresses(addrRes.items ?? []);
      setContacts(contactsRes.items ?? []);
      setOrders(ordersRes.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [token, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !company) {
    return (
      <Screen gradient={false} padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.md }]}>
            {t("common.loading")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
        ]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Text style={theme.typography.title}>{company.name}</Text>

        <EntityActionBar
          token={token!}
          date={dateKey}
          phone={company.phone}
          lat={company.lat}
          lng={company.lng}
          compact
        />

        <Field label={t("clients.phone")} value={company.phone} theme={theme} />
        <Field label={t("companies.edrpou")} value={company.edrpou} theme={theme} />
        <Field label={t("companies.taxId")} value={company.taxId} theme={theme} />
        <Field label={t("clients.address")} value={company.address} theme={theme} />
        <Field label={t("companies.owner")} value={company.owner?.fullName} theme={theme} />

        <SectionTitle title={t("companies.addresses")} />
        {addresses.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
        ) : (
          addresses.map((addr, index) => (
            <AnimatedListItem key={addr.id} index={index} style={{ marginTop: theme.spacing.sm }}>
              <Card>
                {addr.label ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{addr.label}</Text>
                ) : null}
                <Text style={[theme.typography.body, { marginTop: addr.label ? 4 : 0, lineHeight: 20 }]}>
                  {addr.displayLine || addr.addressText}
                </Text>
                {addr.isDefault ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.primary, marginTop: 4 }]}>
                    {t("companies.defaultAddress")}
                  </Text>
                ) : null}
              </Card>
            </AnimatedListItem>
          ))
        )}

        <SectionTitle title={t("companies.contacts")} />
        {contacts.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
        ) : (
          contacts.map((contact, index) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              index={index}
              onPress={() => router.push(`/contact/${contact.id}`)}
            />
          ))
        )}

        <SectionTitle title={t("companies.orders")} />
        <AppButton
          label={t("orders.new")}
          onPress={() => router.push(`/orders/new?companyId=${encodeURIComponent(company.id)}`)}
          variant="secondary"
          style={{ marginBottom: theme.spacing.sm, alignSelf: "flex-start" }}
        />
        {orders.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
        ) : (
          orders.map((o, index) => (
            <AnimatedListItem key={o.id} index={index} style={{ marginTop: theme.spacing.sm }}>
              <Card onPress={() => router.push(`/orders/${o.id}`)}>
                <Text style={theme.typography.bodyMedium}>
                  {o.orderNumber ? `#${o.orderNumber}` : t("orders.orderFallback")}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {o.status}
                  {o.orderStage ? ` · ${o.orderStage}` : ""}
                </Text>
              </Card>
            </AnimatedListItem>
          ))
        )}

        <AppButton
          label={t("common.cancel")}
          onPress={() => router.back()}
          variant="ghost"
          style={{ marginTop: theme.spacing.xl, alignSelf: "center" }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingTop: 8, gap: 4 },
});
