import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import { contactDisplayName } from "@/components/ContactRow";
import { Text } from "@/components/Themed";
import { CreatePaymentLinkSheet } from "@/components/order/CreatePaymentLinkSheet";
import { OrderStageControl } from "@/components/order/OrderStageControl";
import { ShippingProfilePicker } from "@/components/ShippingProfilePicker";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { ApiError } from "@/lib/api";
import { contactsApi } from "@/lib/api/contacts";
import { npApi } from "@/lib/api/np";
import { ordersApi } from "@/lib/api/orders";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { orderDisplayStatusLabel } from "@/lib/labels";
import { formatBaseMoney, formatOrderAmount } from "@/lib/order-currency";
import type { Contact, Order, OrderItem } from "@/types/crm";

function formatAmount(
  amount: number | null | undefined,
  currency?: string | null,
  exchangeRate?: number | null,
): string {
  if (amount == null) return "—";
  return formatOrderAmount(amount, currency ?? "USD", exchangeRate);
}

function itemLineTotal(item: OrderItem): number {
  return item.lineTotal ?? item.qty * item.price * (1 - (item.discountPercent ?? 0) / 100);
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
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
  const [codEnabled, setCodEnabled] = useState(false);
  const [codAmountUah, setCodAmountUah] = useState("");
  const [codFeatureEnabled, setCodFeatureEnabled] = useState(false);
  const [codMeta, setCodMeta] = useState<{
    debtAmount: number;
    currency: string;
    suggestedAmountUah: number;
  } | null>(null);
  const [stageBusy, setStageBusy] = useState(false);
  const [showPaymentLinkSheet, setShowPaymentLinkSheet] = useState(false);

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

      let hasTtn = Boolean(ttnFromData);

      if (npEnabled && row.deliveryMethod === "NOVA_POSHTA") {
        try {
          const status = await npApi.ttnStatus(token, orderId, true);
          setTtnNumber(status.ttn);
          hasTtn = hasTtn || Boolean(status.ttn);
          const st = status.status as Record<string, unknown> | undefined;
          setTtnStatus(st?.Status != null ? String(st.Status) : null);
        } catch {
          if (!hasTtn) {
            try {
              const details = await npApi.getTtn(token, orderId);
              setTtnNumber(details.ttn.documentNumber);
              setTtnStatus(details.ttn.statusText ?? null);
              hasTtn = true;
            } catch {
              // no TTN yet
            }
          }
        }

        if (!hasTtn) {
          try {
            const defaults = await npApi.ttnDefaults(token, orderId);
            setCodFeatureEnabled(defaults.codFeatureEnabled === true);
            const cod = defaults.cod;
            if (defaults.codFeatureEnabled && cod) {
              setCodEnabled(cod.enabled);
              setCodAmountUah(
                cod.enabled && cod.suggestedAmountUah > 0 ? String(cod.suggestedAmountUah) : "",
              );
              setCodMeta({
                debtAmount: cod.debtAmount,
                currency: cod.currency,
                suggestedAmountUah: cod.suggestedAmountUah,
              });
            } else {
              setCodEnabled(false);
              setCodAmountUah("");
              setCodMeta(null);
            }
          } catch {
            /* defaults optional */
          }
        }
      }
    } catch (e) {
      setOrder(null);
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
        setLoadError(t("orders.notFound"));
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

  async function onCreateTtn() {
    if (!token || !orderId || !selectedProfileId) {
      Alert.alert(t("common.error"), t("orders.selectDeliveryProfile"));
      return;
    }
    const body: { profileId: string; afterpaymentOnGoodsCost?: number } = {
      profileId: selectedProfileId,
    };
    if (codEnabled && codFeatureEnabled) {
      const n = parseFloat(codAmountUah.replace(/,/g, ".").trim());
      if (!Number.isFinite(n) || n <= 0) {
        Alert.alert(t("common.error"), t("orders.codAmountRequired"));
        return;
      }
      body.afterpaymentOnGoodsCost = Math.round(n * 100) / 100;
    }
    setTtnBusy(true);
    try {
      const res = await npApi.createTtn(token, orderId, body);
      setTtnNumber(res.documentNumber);
      Alert.alert(t("common.done"), t("orders.ttnCreated", { number: res.documentNumber }));
      await load();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setTtnBusy(false);
    }
  }

  async function onChangeStage(toStage: string) {
    if (!token || !orderId) return;
    setStageBusy(true);
    try {
      const updated = await ordersApi.updateStage(token, orderId, toStage);
      setOrder(updated);
    } finally {
      setStageBusy(false);
    }
  }

  function paymentTypeLabel(pt: string | null | undefined): string {
    if (!pt) return "—";
    const key = `orderCreate.paymentType_${pt}` as const;
    const label = t(key);
    return label === key ? pt : label;
  }

  function paymentMethodLabel(pm: string | null | undefined): string {
    if (!pm) return "—";
    const key = `orderCreate.paymentMethod_${pm}` as const;
    const label = t(key);
    return label === key ? pm : label;
  }

  if (!orderId) {
    return (
      <Screen contentStyle={styles.centered}>
        <Text style={theme.typography.title}>{t("orders.invalidLink")}</Text>
        <AppButton label={t("common.back")} onPress={() => router.back()} variant="secondary" style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={[theme.typography.caption, { marginTop: 12, color: theme.colors.textMuted }]}>
          {t("common.loading")}
        </Text>
      </Screen>
    );
  }

  if (loadError || !order) {
    return (
      <Screen contentStyle={styles.centered}>
        <Card style={{ width: "100%" }}>
          <Text style={theme.typography.title}>{notFound ? t("orders.noAccess") : t("common.error")}</Text>
          <Text style={[theme.typography.body, { marginTop: 8, color: theme.colors.textMuted }]}>
            {loadError ?? t("common.noData")}
          </Text>
        </Card>
        <AppButton label={t("common.retry")} onPress={() => void load()} style={{ marginTop: 16, alignSelf: "stretch" }} />
        <AppButton
          label={t("orders.backToList")}
          onPress={() => router.replace("/orders")}
          variant="secondary"
          style={{ marginTop: 8, alignSelf: "stretch" }}
        />
      </Screen>
    );
  }

  const items = order.items ?? [];
  const title = order.orderNumber
    ? `${t("orders.orderFallback")} #${order.orderNumber}`
    : t("orders.orderFallback");
  const canCreatePaymentLink = order.paymentMethod === "FOP" || Boolean(order.bankAccountId);
  const debtAmount = order.debtAmount ?? 0;

  function onPaymentLinkPress() {
    if (!canCreatePaymentLink) {
      Alert.alert(t("common.error"), t("paymentLink.noBankAccount"));
      return;
    }
    setShowPaymentLinkSheet(true);
  }

  return (
    <Screen padded={false} contentStyle={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.primary} />
        }>
        <View style={styles.titleRow}>
          <Text style={[theme.typography.title, { flex: 1 }]}>{title}</Text>
          <StatusPill label={orderDisplayStatusLabel(order.orderStage, order.status)} tone="info" />
        </View>
        <AppButton
          label={t("orders.edit")}
          onPress={() => router.push(`/orders/${orderId}/edit`)}
          variant="secondary"
          style={{ alignSelf: "flex-start", marginTop: 8, marginBottom: 4 }}
        />
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
          {t("orders.amount")}: {formatAmount(order.totalAmount, order.currency, order.exchangeRate)}
        </Text>

        {contact ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              {t("orders.client")}
            </Text>
            <Text style={[theme.typography.bodyMedium, { marginTop: 4 }]}>{contactDisplayName(contact)}</Text>
            {order.company?.name ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                {order.company.name}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {token ? (
          <OrderStageControl order={order} busy={stageBusy} onChangeStage={onChangeStage} />
        ) : null}

        <SectionTitle title={t("orderCreate.conditions")} />
        <Card style={{ marginBottom: theme.spacing.md }}>
          <Text style={[theme.typography.body, styles.condLine]}>
            {t("orderCreate.paymentType")}: {paymentTypeLabel(order.paymentType)}
          </Text>
          <Text style={[theme.typography.body, styles.condLine]}>
            {t("orderCreate.paymentMethod")}: {paymentMethodLabel(order.paymentMethod)}
          </Text>
          {order.warehouse?.name ? (
            <Text style={[theme.typography.body, styles.condLine]}>
              {t("orderCreate.warehouse")}: {order.warehouse.name}
            </Text>
          ) : null}
          <Text style={[theme.typography.body, styles.condLine]}>
            {t("orderCreate.deliveryMethod")}:{" "}
            {order.deliveryMethod === "NOVA_POSHTA" ? t("orders.novaPoshta") : t("orderCreate.pickup")}
          </Text>
          <Text style={[theme.typography.body, styles.condLine]}>
            {t("orderCreate.documents")}: {order.documentsRequested ? t("common.ok") : t("common.cancel")}
          </Text>
          {(order.discountAmount ?? 0) > 0 ? (
            <Text style={[theme.typography.body, styles.condLine]}>
              {t("orderCreate.orderDiscount")}:{" "}
              {formatBaseMoney(order.discountAmount!, order.currency ?? "USD")}
            </Text>
          ) : null}
          {order.paymentDueDate ? (
            <Text style={[theme.typography.body, styles.condLine]}>
              {t("orderCreate.deferredDue")}: {new Date(order.paymentDueDate).toLocaleDateString("uk-UA")}
            </Text>
          ) : null}
          {order.paidAmount != null || order.debtAmount != null ? (
            <Text style={[theme.typography.body, styles.condLine]}>
              {t("orders.paidDebt")}: {formatAmount(order.paidAmount, order.currency, order.exchangeRate)} /{" "}
              {formatAmount(order.debtAmount, order.currency, order.exchangeRate)}
            </Text>
          ) : null}
        </Card>

        {token ? (
          <AppButton
            label={t("paymentLink.create")}
            onPress={onPaymentLinkPress}
            disabled={!canCreatePaymentLink}
            variant="secondary"
            style={{ marginBottom: theme.spacing.md, alignSelf: "flex-start" }}
          />
        ) : null}

        {order.comment ? (
          <Card style={{ marginBottom: theme.spacing.md }}>
            <Text style={theme.typography.body}>{order.comment}</Text>
          </Card>
        ) : null}

        <SectionTitle title={t("orders.items")} />
        {items.length === 0 ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
        ) : (
          items.map((item, index) => (
            <Card key={item.id} style={{ marginBottom: theme.spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, width: 20, marginTop: 2 }]}>
                  {index + 1}.
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={theme.typography.bodyMedium}>
                    {item.productName ?? item.productNameSnapshot ?? t("orders.productFallback")}
                  </Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                    {item.qty} × {formatBaseMoney(item.price, order.currency ?? "USD")}
                    {item.discountPercent ? ` (−${item.discountPercent}%)` : ""} ={" "}
                    {formatBaseMoney(itemLineTotal(item), order.currency ?? "USD")}
                  </Text>
                </View>
              </View>
            </Card>
          ))
        )}

        {npEnabled && order.contactId && contact ? (
          <>
            <SectionTitle title={t("orders.novaPoshta")} />
            {order.deliveryMethod === "NOVA_POSHTA" ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                {t("orders.deliveryNp")}
              </Text>
            ) : null}

            {ttnNumber ? (
              <Card>
                <Text style={theme.typography.bodyMedium}>
                  {t("orders.ttn")} №{ttnNumber}
                </Text>
                {ttnStatus ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                    {ttnStatus}
                  </Text>
                ) : null}
              </Card>
            ) : (
              <>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                  {t("orders.selectAddressForTtn")}
                </Text>
                {token ? (
                  <ShippingProfilePicker
                    token={token}
                    contact={contact}
                    selectedProfileId={selectedProfileId}
                    onSelectProfileId={setSelectedProfileId}
                  />
                ) : null}
                {codFeatureEnabled ? (
                <Card style={{ marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}>
                    <Text style={theme.typography.bodyMedium}>{t("orders.codPayment")}</Text>
                    <Switch
                      value={codEnabled}
                      onValueChange={setCodEnabled}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                    />
                  </View>
                  {codEnabled ? (
                    <>
                      <TextField
                        label={t("orders.codAmount")}
                        value={codAmountUah}
                        onChangeText={setCodAmountUah}
                        keyboardType="decimal-pad"
                        style={{ marginTop: theme.spacing.sm }}
                      />
                      {codMeta && codMeta.debtAmount > 0 ? (
                        <Text
                          style={[
                            theme.typography.caption,
                            { color: theme.colors.textMuted, marginTop: 4 },
                          ]}>
                          {codMeta.currency !== "UAH"
                            ? t("orders.codDebtHint", {
                                debt: codMeta.debtAmount.toFixed(2),
                                currency: codMeta.currency,
                                uah: codMeta.suggestedAmountUah.toFixed(2),
                              })
                            : t("orders.codDebtHintUah", {
                                debt: codMeta.debtAmount.toFixed(2),
                              })}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </Card>
                ) : null}
                <AppButton
                  label={ttnBusy ? "…" : t("orders.createTtn")}
                  onPress={() => void onCreateTtn()}
                  disabled={ttnBusy || !selectedProfileId}
                  loading={ttnBusy}
                  style={{ marginTop: theme.spacing.md }}
                />
              </>
            )}
          </>
        ) : null}

        <AppButton
          label={t("common.cancel")}
          onPress={() => router.back()}
          variant="ghost"
          style={{ marginTop: theme.spacing.xl, alignSelf: "center" }}
        />
      </ScrollView>

      {token && order ? (
        <CreatePaymentLinkSheet
          visible={showPaymentLinkSheet}
          onClose={() => setShowPaymentLinkSheet(false)}
          token={token}
          orderId={order.id}
          orderNumber={order.orderNumber ?? ""}
          currency={order.currency ?? "UAH"}
          exchangeRate={order.exchangeRate}
          debtAmount={debtAmount}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: {},
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  condLine: { marginBottom: 6 },
});
