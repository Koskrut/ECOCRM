import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { Card } from "@/components/ui/Card";
import { OrderStickyFooter } from "@/components/OrderStickyFooter";
import { ProductPicker } from "@/components/ProductPicker";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { ShippingProfilePicker } from "@/components/ShippingProfilePicker";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { ApiError } from "@/lib/api";
import { contactsApi } from "@/lib/api/contacts";
import { npApi } from "@/lib/api/np";
import { ordersApi } from "@/lib/api/orders";
import { colors, spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import { orderStageLabel } from "@/lib/labels";
import type { Contact, Order, OrderItem, Product } from "@/types/crm";

function formatAmount(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null) return "—";
  return `${amount} ${currency ?? ""}`.trim();
}

function itemLineTotal(item: OrderItem): number {
  return item.lineTotal ?? item.qty * item.price * (1 - (item.discountPercent ?? 0) / 100);
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const orderId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();
  const { npEnabled } = useModules();

  const [order, setOrder] = useState<Order | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [ttnNumber, setTtnNumber] = useState<string | null>(null);
  const [ttnStatus, setTtnStatus] = useState<string | null>(null);
  const [ttnBusy, setTtnBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token || !orderId) return;
    setLoadError(null);
    setNotFound(false);
    try {
      const row = await ordersApi.getById(token, orderId);
      setOrder(row);

      const npData = (row.deliveryData?.novaPoshta ?? {}) as Record<string, unknown>;
      const savedProfileId =
        typeof npData.shippingProfileId === "string" ? npData.shippingProfileId : null;
      if (savedProfileId) setSelectedProfileId(savedProfileId);

      const ttnFromData =
        typeof (npData.ttn as Record<string, unknown> | undefined)?.number === "string"
          ? String((npData.ttn as Record<string, unknown>).number)
          : null;
      if (ttnFromData) setTtnNumber(ttnFromData);

      if (row.contactId) {
        try {
          const c = await contactsApi.getById(token, row.contactId);
          setContact(c);
        } catch {
          setContact(null);
        }
      } else {
        setContact(null);
      }

      if (npEnabled && row.deliveryMethod === "NOVA_POSHTA") {
        try {
          const status = await npApi.ttnStatus(token, orderId, true);
          setTtnNumber(status.ttn);
          const st = status.status as Record<string, unknown> | undefined;
          setTtnStatus(st?.Status != null ? String(st.Status) : null);
        } catch {
          if (!ttnFromData) {
            try {
              const details = await npApi.getTtn(token, orderId);
              setTtnNumber(details.ttn.documentNumber);
              setTtnStatus(details.ttn.statusText ?? null);
            } catch {
              // no TTN yet
            }
          }
        }
      }
    } catch (e) {
      setOrder(null);
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
        setLoadError("Замовлення не знайдено або немає доступу");
      } else {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, orderId, npEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onAddProduct(product: Product) {
    if (!token || !orderId) return;
    setSaving(true);
    try {
      const updated = await ordersApi.addItem(token, orderId, {
        productId: product.id,
        qty: 1,
        price: product.basePrice ?? 0,
      });
      setOrder(updated);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onUpdateQty(item: OrderItem, qty: number) {
    if (!token || !orderId || qty < 1) return;
    setSaving(true);
    try {
      const updated = await ordersApi.updateItem(token, orderId, item.id, { qty });
      setOrder(updated);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onRemoveItem(item: OrderItem) {
    if (!token || !orderId) return;
    setSaving(true);
    try {
      const updated = await ordersApi.removeItem(token, orderId, item.id);
      setOrder(updated);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onCreateTtn() {
    if (!token || !orderId || !selectedProfileId) {
      Alert.alert(t("common.error"), "Оберіть профіль доставки");
      return;
    }
    setTtnBusy(true);
    try {
      const res = await npApi.createTtn(token, orderId, { profileId: selectedProfileId });
      setTtnNumber(res.documentNumber);
      Alert.alert(t("common.done"), `ТТН №${res.documentNumber} створено`);
      await load();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setTtnBusy(false);
    }
  }

  if (!orderId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Невірне посилання</Text>
        <PrimaryButton label="Назад" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (loadError || !order) {
    return (
      <View style={styles.centered}>
        <Card style={{ width: "100%" }}>
          <Text style={styles.errorTitle}>{notFound ? "Немає доступу" : t("common.error")}</Text>
          <Text style={styles.errorBody}>{loadError ?? t("common.noData")}</Text>
        </Card>
        <PrimaryButton label={t("common.retry")} onPress={() => void load()} style={{ marginTop: spacing.lg }} />
        <PrimaryButton
          label="До списку"
          onPress={() => router.replace("/orders")}
          variant="secondary"
          style={{ marginTop: spacing.sm }}
        />
      </View>
    );
  }

  const items = order.items ?? [];

  return (
    <View style={styles.root}>
    <ScrollView
      contentContainerStyle={[styles.scroll, editing && { paddingBottom: 120 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {order.orderNumber ? `Замовлення #${order.orderNumber}` : "Замовлення"}
        </Text>
        <StatusPill label={orderStageLabel(order.orderStage) || order.status} tone="info" />
      </View>
      <Pressable
        onPress={() => setEditing((v) => !v)}
        style={styles.editToggle}
        accessibilityRole="button">
        <Text style={styles.editToggleText}>{editing ? "Готово" : "Редагувати"}</Text>
      </Pressable>
      <Text style={styles.meta}>Сума: {formatAmount(order.totalAmount, order.currency)}</Text>

      {order.comment ? <Text style={styles.box}>{order.comment}</Text> : null}

      <SectionTitle title="Позиції" />
      {editing && token ? <ProductPicker token={token} onSelect={(p) => void onAddProduct(p)} /> : null}
      {items.length === 0 ? (
        <Text style={styles.muted}>{t("common.noData")}</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.productName ?? item.productNameSnapshot ?? "Товар"}
            </Text>
            {editing ? (
              <View style={styles.qtyRow}>
                <Pressable onPress={() => void onUpdateQty(item, item.qty - 1)} style={styles.qtyBtn}>
                  <Text>−</Text>
                </Pressable>
                <Text style={styles.qtyVal}>{item.qty}</Text>
                <Pressable onPress={() => void onUpdateQty(item, item.qty + 1)} style={styles.qtyBtn}>
                  <Text>+</Text>
                </Pressable>
                <Pressable onPress={() => void onRemoveItem(item)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            ) : null}
            <Text style={styles.itemMeta}>
              {item.qty} × {item.price}
              {item.discountPercent ? ` (−${item.discountPercent}%)` : ""} = {itemLineTotal(item)}
            </Text>
          </View>
        ))
      )}

      {npEnabled && order.contactId && contact ? (
        <>
          <SectionTitle title="Nova Poshta" />
          {order.deliveryMethod === "NOVA_POSHTA" ? (
            <Text style={styles.muted}>Доставка: Нова Пошта</Text>
          ) : null}

          {ttnNumber ? (
            <View style={styles.box}>
              <Text style={{ fontWeight: "700" }}>ТТН №{ttnNumber}</Text>
              {ttnStatus ? <Text style={styles.muted}>{ttnStatus}</Text> : null}
            </View>
          ) : (
            <>
              <Text style={styles.muted}>Оберіть адресу для створення ТТН</Text>
              {token ? (
                <ShippingProfilePicker
                  token={token}
                  contact={contact}
                  selectedProfileId={selectedProfileId}
                  onSelectProfileId={setSelectedProfileId}
                />
              ) : null}
              <Pressable
                disabled={ttnBusy || !selectedProfileId}
                onPress={() => void onCreateTtn()}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.btnPrimary,
                  (ttnBusy || !selectedProfileId || pressed) && { opacity: 0.75 },
                ]}>
                <Text style={styles.btnPrimaryText}>{ttnBusy ? "…" : "Створити ТТН"}</Text>
              </Pressable>
            </>
          )}
        </>
      ) : null}

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}>
        <Text style={styles.backBtnText}>{t("common.cancel")}</Text>
      </Pressable>
    </ScrollView>
    {editing ? (
      <OrderStickyFooter
        totalLabel={`Сума: ${formatAmount(order.totalAmount, order.currency)}`}
        actionLabel={saving ? "…" : t("common.save")}
        onAction={() => setEditing(false)}
        loading={saving}
      />
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: 16, paddingBottom: 32 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  editToggle: { alignSelf: "flex-start", marginTop: 8, marginBottom: 4 },
  editToggleText: { color: colors.primaryText, fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  meta: { marginTop: 6, opacity: 0.75, lineHeight: 20 },
  errorTitle: { fontWeight: "700", fontSize: 18, marginBottom: 8 },
  errorBody: { opacity: 0.8, lineHeight: 22 },
  box: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  muted: { opacity: 0.7, marginBottom: 8 },
  itemRow: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 8,
  },
  itemName: { fontWeight: "700", fontSize: 15 },
  itemMeta: { marginTop: 4, opacity: 0.75, fontSize: 13 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyVal: { fontWeight: "700", minWidth: 24, textAlign: "center" },
  removeBtn: { marginLeft: "auto", padding: 8 },
  removeText: { color: colors.danger, fontWeight: "700" },
  btnPrimary: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backBtn: { marginTop: 24, alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20 },
  backBtnText: { color: "#2563eb", fontWeight: "600" },
});
