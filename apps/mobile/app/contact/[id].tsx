import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { contactDisplayName } from "@/components/ContactRow";
import { EntityActionBar } from "@/components/EntityActionBar";
import { VisitCard } from "@/components/VisitCard";
import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { contactsApi } from "@/lib/api/contacts";
import { activitiesApi, type Activity } from "@/lib/api/activities";
import { ordersApi } from "@/lib/api/orders";
import { visitsApi } from "@/lib/api/visits";
import { formatLocalDateKey, startOfLocalDayIso, endOfLocalDayIso } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { clientStageLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";
import type { Contact, Order, VisitSummary } from "@/types/crm";

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

export default function ContactDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const contactId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();
  const { visitsEnabled } = useModules();
  const dateKey = formatLocalDateKey();

  const [contact, setContact] = useState<Contact | null>(null);
  const [visitsToday, setVisitsToday] = useState<VisitSummary[]>([]);
  const [phones, setPhones] = useState<string[]>([]);
  const [recentVisits, setRecentVisits] = useState<VisitSummary[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !contactId) {
      setContact(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const c = await contactsApi.getById(token, contactId);
      setContact(c);
      const phonesRes = await contactsApi.getPhones(token, contactId).catch(() => null);
      const primary =
        typeof phonesRes?.primary === "string"
          ? phonesRes.primary
          : phonesRes?.primary?.phone ?? null;
      const phoneList = [
        primary,
        ...(phonesRes?.additional?.map((p) => p.phone) ?? []),
      ].filter((p): p is string => Boolean(p?.trim()));
      setPhones([...new Set(phoneList)]);
      if (visitsEnabled) {
        const day = await visitsApi
          .history(token, {
            from: startOfLocalDayIso(new Date(dateKey)),
            to: endOfLocalDayIso(new Date(dateKey)),
            page: 1,
            pageSize: 100,
          })
          .catch(() => ({ items: [] as VisitSummary[], total: 0, page: 1, pageSize: 100 }));
        const todayItems = (day.items ?? []).filter((v) => v.contactId === contactId);
        setVisitsToday(todayItems);

        const hist = await visitsApi
          .history(token, {
            from: startOfLocalDayIso(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
            to: endOfLocalDayIso(new Date()),
            page: 1,
            pageSize: 30,
          })
          .catch(() => ({ items: [] as VisitSummary[], total: 0, page: 1, pageSize: 30 }));
        setRecentVisits((hist.items ?? []).filter((v) => v.contactId === contactId));
      } else {
        setVisitsToday([]);
        setRecentVisits([]);
      }

      const ord = await ordersApi
        .list(token, { contactId, page: 1, pageSize: 10 })
        .catch(() => ({ items: [] as Order[], total: 0, page: 1, pageSize: 10 }));
      setOrders(ord.items ?? []);

      const act = await activitiesApi
        .listForContact(token, contactId, { limit: 30 })
        .catch(() => ({ items: [] as Activity[] }));
      setActivities(act.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [token, contactId, dateKey, visitsEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !contact) {
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

  const name = contactDisplayName(contact);
  const phone = phones[0] ?? (contact.phone || contact.phones?.[0]?.phone);

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
        ]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Text style={theme.typography.title}>{name}</Text>

        <EntityActionBar
          token={token!}
          date={dateKey}
          phone={phone}
          contactId={contact.id}
          lat={contact.lat}
          lng={contact.lng}
          compact
        />

        <AppButton
          label={t("clients.edit")}
          onPress={() => router.push(`/contact/${contact.id}/edit`)}
          variant="secondary"
          style={{ marginTop: theme.spacing.md, alignSelf: "flex-start" }}
        />

        <Field label={t("clients.phone")} value={phone} theme={theme} />
        {phones.length > 1 ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {phones.slice(1).join(" · ")}
          </Text>
        ) : null}
        <Field label={t("clients.email")} value={contact.email} theme={theme} />
        <Field label={t("clients.position")} value={contact.position} theme={theme} />
        <Field label={t("clients.company")} value={contact.company?.name} theme={theme} />
        <Field label={t("clients.region")} value={contact.region} theme={theme} />
        <Field label={t("clients.city")} value={contact.city} theme={theme} />
        <Field label={t("clients.address")} value={contact.address} theme={theme} />
        <Field label={t("clients.clientType")} value={contact.clientType} theme={theme} />
        <Field label={t("clients.status")} value={contact.status} theme={theme} />
        <Field
          label={t("clients.stage")}
          value={clientStageLabel(contact.clientStage) || null}
          theme={theme}
        />
        <Field label={t("clients.owner")} value={contact.owner?.fullName} theme={theme} />

        <AppButton
          label={t("contacts.noteAdd")}
          onPress={() => router.push(`/contact/${contact.id}/activity/new`)}
          variant="ghost"
          style={{ marginTop: theme.spacing.lg, alignSelf: "flex-start" }}
        />

        <SectionTitle title={t("clients.timeline")} />
        {activities.length === 0 ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
        ) : (
          activities.map((a, index) => (
            <AnimatedListItem key={a.id} index={index} style={{ marginTop: theme.spacing.sm }}>
              <Card>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                  {new Date(a.createdAt).toLocaleString("uk-UA")} · {a.kind}
                </Text>
                <Text style={[theme.typography.body, { marginTop: 4, lineHeight: 20 }]}>{a.body}</Text>
              </Card>
            </AnimatedListItem>
          ))
        )}

        {visitsEnabled ? (
          <>
            <SectionTitle title={t("clients.visitsToday")} />
            {visitsToday.length === 0 ? (
              <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
                {t("clients.noVisitsToday")}
              </Text>
            ) : (
              visitsToday.map((v) => (
                <VisitCard
                  key={v.id}
                  visit={v}
                  onPress={() => router.push(`/visit/${v.id}`)}
                />
              ))
            )}

            <SectionTitle title={t("clients.recentVisits")} />
            {recentVisits.length === 0 ? (
              <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
            ) : (
              recentVisits.map((v) => (
                <VisitCard
                  key={v.id}
                  visit={v}
                  onPress={() => router.push(`/visit/${v.id}`)}
                />
              ))
            )}
          </>
        ) : null}

        <SectionTitle title={t("orders.title")} />
        <AppButton
          label={t("orders.new")}
          onPress={() => router.push(`/orders/new?contactId=${encodeURIComponent(contact.id)}`)}
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
