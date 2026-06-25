import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";

import { ContactRow } from "@/components/ContactRow";
import { EmptyState } from "@/components/EmptyState";
import { draftLinesTotal, OrderItemRow } from "@/components/OrderItemRow";
import { ProductPicker } from "@/components/ProductPicker";
import { ShippingProfilePicker } from "@/components/ShippingProfilePicker";
import { Card } from "@/components/ui/Card";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchField } from "@/components/ui/SearchField";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { contactsApi } from "@/lib/api/contacts";
import { ordersApi } from "@/lib/api/orders";
import { productsApi } from "@/lib/api/products";
import { colors, spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import type { Contact, DraftOrderLine, Product } from "@/types/crm";

type Step = 1 | 2 | 3 | 4;

const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: "Клієнт" },
  { n: 2, label: "Товари" },
  { n: 3, label: "Доставка" },
  { n: 4, label: "Перевірка" },
];

function newLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function NewOrderScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { npEnabled } = useModules();
  const rawContactId = useLocalSearchParams<{ contactId?: string; productId?: string }>();
  const preselectedContactId =
    typeof rawContactId.contactId === "string" && rawContactId.contactId ? rawContactId.contactId : null;
  const preselectedProductId =
    typeof rawContactId.productId === "string" && rawContactId.productId ? rawContactId.productId : null;

  const [step, setStep] = useState<Step>(1);
  const [contact, setContact] = useState<Contact | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  const [lines, setLines] = useState<DraftOrderLine[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [useNp, setUseNp] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => draftLinesTotal(lines), [lines]);

  const loadPreselected = useCallback(async () => {
    if (!token || !preselectedContactId) return;
    try {
      const c = await contactsApi.getById(token, preselectedContactId);
      setContact(c);
      setStep(2);
    } catch {
      // ignore
    }
  }, [token, preselectedContactId]);

  useEffect(() => {
    void loadPreselected();
  }, [loadPreselected]);

  const loadPreselectedProduct = useCallback(async () => {
    if (!token || !preselectedProductId) return;
    try {
      const res = await productsApi.list(token, { pageSize: 100, catalog: true });
      const product = (res.items ?? []).find((p) => p.id === preselectedProductId);
      if (product) {
        setLines((prev) => {
          if (prev.some((l) => l.productId === product.id)) return prev;
          return [
            ...prev,
            {
              key: newLineKey(),
              productId: product.id,
              productName: product.name ?? product.sku ?? "Товар",
              qty: 1,
              price: product.basePrice ?? 0,
              discountPercent: 0,
            },
          ];
        });
        if (!preselectedContactId) setStep(2);
      }
    } catch {
      // ignore
    }
  }, [token, preselectedProductId, preselectedContactId]);

  useEffect(() => {
    void loadPreselectedProduct();
  }, [loadPreselectedProduct]);

  useEffect(() => {
    const q = query.trim();
    if (!token) return;
    if (!q) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await contactsApi.search(token, q);
          setResults(res.items ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [token, query]);

  function onProductSelect(product: Product) {
    const existing = lines.find((l) => l.productId === product.id);
    if (existing) {
      setLines((prev) =>
        prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l)),
      );
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: newLineKey(),
        productId: product.id,
        productName: product.name ?? product.sku ?? "Товар",
        qty: 1,
        price: product.basePrice ?? 0,
        discountPercent: 0,
      },
    ]);
  }

  function goNext() {
    if (step === 1 && !contact) {
      Alert.alert(t("common.error"), "Оберіть клієнта");
      return;
    }
    if (step === 2 && lines.length === 0) {
      Alert.alert(t("common.error"), "Додайте хоча б одну позицію");
      return;
    }
    if (step === 3 && useNp && npEnabled && !selectedProfileId) {
      Alert.alert(t("common.error"), "Оберіть адресу Nova Poshta");
      return;
    }
    setStep((s) => Math.min(4, s + 1) as Step);
  }

  async function onCreate() {
    if (!token || !contact) return;
    if (lines.length === 0) {
      Alert.alert(t("common.error"), "Додайте хоча б одну позицію");
      return;
    }
    if (useNp && npEnabled && !selectedProfileId) {
      Alert.alert(t("common.error"), "Оберіть або створіть адресу Nova Poshta");
      return;
    }

    setBusy(true);
    try {
      let order = await ordersApi.create(token, {
        contactId: contact.id,
        companyId: contact.company?.id ?? null,
        comment: comment.trim() || undefined,
      });

      for (const line of lines) {
        order = await ordersApi.addItem(token, order.id, {
          productId: line.productId,
          qty: line.qty,
          price: line.price,
          discountPercent: line.discountPercent || undefined,
        });
      }

      if (useNp && npEnabled && selectedProfileId) {
        order = await ordersApi.patch(token, order.id, {
          deliveryMethod: "NOVA_POSHTA",
          deliveryData: {
            novaPoshta: { shippingProfileId: selectedProfileId },
          },
        });
      }

      Alert.alert(t("common.done"), "Замовлення створено", [
        { text: t("common.ok"), onPress: () => router.replace(`/orders/${order.id}`) },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title="Нове замовлення" />

        <View style={styles.steps}>
          {STEPS.map((s) => (
            <Pressable
              key={s.n}
              onPress={() => {
                if (s.n < step) setStep(s.n);
              }}
              style={[styles.stepChip, step === s.n && styles.stepChipOn, s.n > step && styles.stepChipFuture]}>
              <Text style={[styles.stepText, step === s.n && styles.stepTextOn]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {step === 1 ? (
          <>
            <SectionTitle title="Клієнт" subtitle="Знайдіть контакт для замовлення" />
            {contact ? (
              <Card>
                <Text style={styles.selectedName}>
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone}
                </Text>
                <Text style={styles.selectedMeta}>{contact.company?.name ?? contact.address ?? ""}</Text>
                <Pressable
                  onPress={() => {
                    setContact(null);
                    setSelectedProfileId(null);
                    setUseNp(false);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.linkText}>Змінити</Text>
                </Pressable>
              </Card>
            ) : (
              <>
                <SearchField value={query} onChangeText={setQuery} placeholder={t("clients.searchHint")} />
                {searching ? <Text style={styles.muted}>{t("common.loading")}</Text> : null}
                {query.trim() && results.length === 0 && !searching ? (
                  <EmptyState message={t("clients.empty")} />
                ) : null}
                {results.map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    onPress={() => {
                      setContact(c);
                      setStep(2);
                    }}
                  />
                ))}
              </>
            )}
          </>
        ) : null}

        {step === 2 && contact ? (
          <>
            <SectionTitle title="Товари" />
            {token ? <ProductPicker token={token} onSelect={onProductSelect} /> : null}
            {lines.length === 0 ? (
              <Text style={styles.muted}>{t("common.noData")}</Text>
            ) : (
              lines.map((line) => (
                <OrderItemRow
                  key={line.key}
                  item={line}
                  onChange={(patch) =>
                    setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, ...patch } : l)))
                  }
                  onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                />
              ))
            )}
          </>
        ) : null}

        {step === 3 && contact ? (
          <>
            <SectionTitle title="Доставка" />
            {npEnabled ? (
              <Card>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Nova Poshta</Text>
                  <Switch value={useNp} onValueChange={setUseNp} />
                </View>
                {useNp && token ? (
                  <ShippingProfilePicker
                    token={token}
                    contact={contact}
                    selectedProfileId={selectedProfileId}
                    onSelectProfileId={setSelectedProfileId}
                  />
                ) : null}
              </Card>
            ) : (
              <Text style={styles.muted}>Доставка налаштовується після створення замовлення</Text>
            )}
            <SectionTitle title="Коментар" />
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Опційно"
              placeholderTextColor={colors.textMuted}
              style={styles.commentInput}
              multiline
            />
          </>
        ) : null}

        {step === 4 && contact ? (
          <>
            <SectionTitle title="Перевірка" />
            <Card>
              <Text style={styles.reviewLine}>
                <Text style={styles.reviewLabel}>Клієнт: </Text>
                {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone}
              </Text>
              <Text style={styles.reviewLine}>
                <Text style={styles.reviewLabel}>Позицій: </Text>
                {lines.length}
              </Text>
              <Text style={styles.reviewLine}>
                <Text style={styles.reviewLabel}>Сума: </Text>
                {total.toFixed(2)}
              </Text>
              <Text style={styles.reviewLine}>
                <Text style={styles.reviewLabel}>Доставка: </Text>
                {useNp && npEnabled ? "Nova Poshta" : "Не вказано"}
              </Text>
              {comment ? (
                <Text style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>Коментар: </Text>
                  {comment}
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerTotal}>
          {lines.length > 0 ? `Разом: ${total.toFixed(2)}` : "Додайте товари"}
        </Text>
        <View style={styles.footerActions}>
          {step > 1 ? (
            <PrimaryButton
              label="Назад"
              variant="secondary"
              onPress={() => setStep((s) => Math.max(1, s - 1) as Step)}
              style={styles.footerBtn}
            />
          ) : null}
          {step < 4 ? (
            <PrimaryButton label="Далі" onPress={goNext} style={styles.footerBtn} />
          ) : (
            <PrimaryButton
              label={busy ? "…" : "Створити"}
              onPress={() => void onCreate()}
              loading={busy}
              disabled={!contact || lines.length === 0}
              style={styles.footerBtn}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  stepChip: {
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.chip,
  },
  stepChipOn: { backgroundColor: colors.chipOn },
  stepChipFuture: { opacity: 0.55 },
  stepText: { fontSize: 12, opacity: 0.75 },
  stepTextOn: { fontWeight: "700", color: colors.primaryText, opacity: 1 },
  selectedName: { fontWeight: "700", fontSize: 16 },
  selectedMeta: { marginTop: 6, opacity: 0.75, lineHeight: 20 },
  link: { marginTop: 10, alignSelf: "flex-start" },
  linkText: { color: colors.primaryText, fontWeight: "600" },
  muted: { opacity: 0.7, marginBottom: spacing.sm },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggleLabel: { fontWeight: "600" },
  commentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: "top",
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  reviewLine: { marginBottom: 8, lineHeight: 22 },
  reviewLabel: { fontWeight: "700" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: "rgba(15,17,23,0.96)",
  },
  footerTotal: { fontWeight: "700", fontSize: 16, marginBottom: spacing.sm },
  footerActions: { flexDirection: "row", gap: spacing.sm },
  footerBtn: { flex: 1 },
});
