import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { contactDisplayName } from "@/components/ContactRow";
import { QuickActions } from "@/components/QuickActions";
import { VisitCard } from "@/components/VisitCard";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { contactsApi } from "@/lib/api/contacts";
import { ordersApi } from "@/lib/api/orders";
import { visitsApi } from "@/lib/api/visits";
import { formatLocalDateKey, startOfLocalDayIso, endOfLocalDayIso } from "@/lib/date";
import { clientStageLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";
import type { Contact, Order, VisitSummary } from "@/types/crm";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function ContactDetailScreen() {
  const router = useRouter();
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
      const phoneList = [
        phonesRes?.primary ?? null,
        ...(phonesRes?.additional?.map((p) => p.phone) ?? []),
      ]
        .filter(Boolean)
        .map((p) => String(p));
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
    } finally {
      setLoading(false);
    }
  }, [token, contactId, dateKey, visitsEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !contact) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  const name = contactDisplayName(contact);
  const phone = phones[0] ?? (contact.phone || contact.phones?.[0]?.phone);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={styles.title}>{name}</Text>

      <QuickActions
        token={token!}
        date={dateKey}
        phone={phone}
        lat={contact.lat}
        lng={contact.lng}
      />

      <Field label={t("clients.phone")} value={phone} />
      {phones.length > 1 ? (
        <Text style={styles.muted}>
          {phones.slice(1).join(" · ")}
        </Text>
      ) : null}
      <Field label={t("clients.email")} value={contact.email} />
      <Field label={t("clients.company")} value={contact.company?.name} />
      <Field label={t("clients.address")} value={contact.address} />
      <Field
        label={t("clients.stage")}
        value={clientStageLabel(contact.clientStage) || contact.status}
      />

      <Pressable
        onPress={() => router.push(`/contact/${contact.id}/activity/new`)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.noteBtn, pressed && { opacity: 0.75 }]}>
        <Text style={styles.noteBtnText}>+ Нотатка</Text>
      </Pressable>

      {visitsEnabled ? (
        <>
          <Text style={styles.section}>{t("clients.visitsToday")}</Text>
          {visitsToday.length === 0 ? (
            <Text style={styles.muted}>{t("clients.noVisitsToday")}</Text>
          ) : (
            visitsToday.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                onPress={() => router.push(`/visit/${v.id}`)}
              />
            ))
          )}

          <Text style={styles.section}>Останні візити</Text>
          {recentVisits.length === 0 ? (
            <Text style={styles.muted}>{t("common.noData")}</Text>
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

      <Text style={styles.section}>Замовлення</Text>
      <Pressable
        onPress={() => router.push(`/orders/new?contactId=${encodeURIComponent(contact.id)}`)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.noteBtn, pressed && { opacity: 0.75 }]}>
        <Text style={styles.noteBtnText}>+ НОВЕ ЗАМОВЛЕННЯ</Text>
      </Pressable>
      {orders.length === 0 ? (
        <Text style={styles.muted}>{t("common.noData")}</Text>
      ) : (
        orders.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => router.push(`/orders/${o.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.orderRow, pressed && { opacity: 0.72 }]}>
            <Text style={{ fontWeight: "700" }}>
              {o.orderNumber ? `#${o.orderNumber}` : "Замовлення"}
            </Text>
            <Text style={styles.muted}>
              {o.status}
              {o.orderStage ? ` · ${o.orderStage}` : ""}
            </Text>
          </Pressable>
        ))
      )}

      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
        accessibilityRole="button">
        <Text style={styles.backBtnText}>{t("common.cancel")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20, paddingBottom: 48, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  field: { marginTop: 12 },
  fieldLabel: { fontSize: 12, opacity: 0.55, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { fontSize: 16, marginTop: 4, lineHeight: 22 },
  section: { fontWeight: "700", fontSize: 16, marginTop: 24, marginBottom: 8 },
  muted: { opacity: 0.65, fontSize: 14 },
  noteBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(37,99,235,0.12)",
  },
  noteBtnText: { color: "#1d4ed8", fontWeight: "700" },
  orderRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.08)",
  },
  backBtn: {
    marginTop: 28,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backBtnText: { color: "#2563eb", fontWeight: "600" },
});
