import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { draftLinesTotal, OrderItemRow } from "@/components/OrderItemRow";
import { OrderStickyFooter } from "@/components/OrderStickyFooter";
import { ProductPicker } from "@/components/ProductPicker";
import { DeliveryMethodSection, type DeliveryMethod } from "@/components/order/DeliveryMethodSection";
import { DocumentsToggle } from "@/components/order/DocumentsToggle";
import { OrderClientStep } from "@/components/order/OrderClientStep";
import { OrderCreateStepBar, type OrderWizardStep } from "@/components/order/OrderCreateStepBar";
import { OrderReviewStep } from "@/components/order/OrderReviewStep";
import { PaymentTermsSection } from "@/components/order/PaymentTermsSection";
import { WarehousePicker } from "@/components/order/WarehousePicker";
import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { companiesApi } from "@/lib/api/companies";
import { contactsApi } from "@/lib/api/contacts";
import { ordersApi } from "@/lib/api/orders";
import { productsApi } from "@/lib/api/products";
import { settingsApi } from "@/lib/api/settings";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { formatBaseMoney } from "@/lib/order-currency";
import { useBaseCurrency } from "@/lib/use-base-currency";
import {
  createOrderFull,
  newDraftLineKey,
  orderItemsToDraftLines,
  saveOrderFull,
  type OrderFormSnapshot,
} from "@/lib/order-save";
import type { Contact, ContactShippingProfile, DraftOrderLine, Product } from "@/types/crm";

export type OrderFormWizardProps = {
  mode: "create" | "edit";
  orderId?: string;
  initialContactId?: string | null;
  initialCompanyId?: string | null;
  initialProductId?: string | null;
  onDone: (orderId: string) => void;
};

export function OrderFormWizard({
  mode,
  orderId,
  initialContactId,
  initialCompanyId,
  initialProductId,
  onDone,
}: OrderFormWizardProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { npEnabled } = useModules();
  const { currency: baseCurrency } = useBaseCurrency();
  const [orderCurrency, setOrderCurrency] = useState<string | null>(null);

  const [loading, setLoading] = useState(mode === "edit");
  const [step, setStep] = useState<OrderWizardStep>(1);
  const [maxReached, setMaxReached] = useState<OrderWizardStep>(1);

  const [contact, setContact] = useState<Contact | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId ?? null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [lines, setLines] = useState<DraftOrderLine[]>([]);
  const [originalLines, setOriginalLines] = useState<DraftOrderLine[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [discountPresets, setDiscountPresets] = useState<number[]>([]);

  const [paymentType, setPaymentType] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("FOP");
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [documentsRequested, setDocumentsRequested] = useState(false);

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("PICKUP");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [shippingProfiles, setShippingProfiles] = useState<ContactShippingProfile[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => draftLinesTotal(lines), [lines]);
  const displayCurrency = orderCurrency ?? baseCurrency;
  const selectedShippingProfile = useMemo(
    () => shippingProfiles.find((p) => p.id === selectedProfileId) ?? null,
    [shippingProfiles, selectedProfileId],
  );

  const snapshot = useMemo<OrderFormSnapshot>(
    () => ({
      contact,
      companyId,
      lines,
      warehouseId,
      paymentType,
      paymentMethod,
      bankAccountId,
      paymentDueDate,
      discountAmount,
      documentsRequested,
      deliveryMethod,
      selectedProfileId,
      comment,
    }),
    [
      contact,
      companyId,
      lines,
      warehouseId,
      paymentType,
      paymentMethod,
      bankAccountId,
      paymentDueDate,
      discountAmount,
      documentsRequested,
      deliveryMethod,
      selectedProfileId,
      comment,
    ],
  );

  const goToStep = useCallback((next: OrderWizardStep) => {
    setStep(next);
    setMaxReached((prev) => (next > prev ? next : prev));
  }, []);

  const loadEditOrder = useCallback(async () => {
    if (!token || !orderId || mode !== "edit") return;
    setLoading(true);
    try {
      const order = await ordersApi.getById(token, orderId);
      const draftLines = orderItemsToDraftLines(order.items ?? []);
      setLines(draftLines);
      setOriginalLines(draftLines.map((l) => ({ ...l })));
      setWarehouseId(order.warehouseId ?? order.warehouse?.id ?? null);
      setPaymentType(order.paymentType ?? null);
      setPaymentMethod(order.paymentMethod ?? "FOP");
      setBankAccountId(order.bankAccountId ?? null);
      setPaymentDueDate(order.paymentDueDate ? order.paymentDueDate.slice(0, 10) : "");
      setDiscountAmount(order.discountAmount ?? 0);
      setDocumentsRequested(!!order.documentsRequested);
      setDeliveryMethod((order.deliveryMethod as DeliveryMethod) ?? "PICKUP");
      setComment(order.comment ?? "");
      setCompanyId(order.companyId ?? order.company?.id ?? null);
      setCompanyName(order.company?.name ?? null);
      setOrderCurrency(order.currency ?? null);

      const npData = (order.deliveryData?.novaPoshta ?? {}) as Record<string, unknown>;
      const profileId =
        typeof npData.shippingProfileId === "string" ? npData.shippingProfileId : null;
      setSelectedProfileId(profileId);

      if (order.contactId) {
        const c = await contactsApi.getById(token, order.contactId);
        setContact(c);
        if (!order.companyId && c.company?.id) {
          setCompanyId(c.company.id);
          setCompanyName(c.company.name ?? null);
        }
      }
      goToStep(1);
      setMaxReached(5);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, orderId, mode, goToStep]);

  const loadPreselectedContact = useCallback(async () => {
    if (!token || !initialContactId || mode !== "create") return;
    try {
      const c = await contactsApi.getById(token, initialContactId);
      setContact(c);
      if (c.company?.id) {
        setCompanyId(c.company.id);
        setCompanyName(c.company.name ?? null);
      }
      goToStep(2);
    } catch {
      // ignore
    }
  }, [token, initialContactId, mode, goToStep]);

  const loadPreselectedCompany = useCallback(async () => {
    if (!token || !initialCompanyId || initialContactId || mode !== "create") return;
    try {
      const company = await companiesApi.getById(token, initialCompanyId);
      setCompanyId(company.id);
      setCompanyName(company.name);
    } catch {
      // ignore
    }
  }, [token, initialCompanyId, initialContactId, mode]);

  const loadPreselectedProduct = useCallback(async () => {
    if (!token || !initialProductId || mode !== "create") return;
    try {
      const res = await productsApi.list(token, { pageSize: 100, catalog: true });
      const product = (res.items ?? []).find((p) => p.id === initialProductId);
      if (product) {
        setLines((prev) => {
          if (prev.some((l) => l.productId === product.id)) return prev;
          return [
            ...prev,
            {
              key: newDraftLineKey(),
              productId: product.id,
              productName: product.name ?? product.sku ?? t("orderCreate.productFallback"),
              productSku: product.sku ?? null,
              qty: 1,
              price: product.basePrice ?? 0,
              discountPercent: 0,
            },
          ];
        });
        if (!initialContactId) goToStep(2);
      }
    } catch {
      // ignore
    }
  }, [token, initialProductId, initialContactId, mode, goToStep]);

  useEffect(() => {
    if (mode === "edit") void loadEditOrder();
  }, [loadEditOrder, mode]);

  useEffect(() => {
    if (mode === "create") {
      void loadPreselectedContact();
      void loadPreselectedCompany();
      void loadPreselectedProduct();
    }
  }, [mode, loadPreselectedContact, loadPreselectedCompany, loadPreselectedProduct]);

  useEffect(() => {
    if (!token) return;
    void settingsApi
      .orderDiscounts(token)
      .then((cfg) => setDiscountPresets(cfg.percents ?? []))
      .catch(() => setDiscountPresets([]));
  }, [token]);

  function onProductSelect(product: Product) {
    const existing = lines.find((l) => l.productId === product.id && !l.itemId);
    if (existing) {
      setLines((prev) =>
        prev.map((l) =>
          l.key === existing.key ? { ...l, qty: l.qty + 1 } : l,
        ),
      );
      return;
    }
    const existingAny = lines.find((l) => l.productId === product.id);
    if (existingAny) {
      setLines((prev) =>
        prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l)),
      );
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: newDraftLineKey(),
        productId: product.id,
        productName: product.name ?? product.sku ?? t("orderCreate.productFallback"),
        productSku: product.sku ?? null,
        qty: 1,
        price: product.basePrice ?? 0,
        discountPercent: 0,
      },
    ]);
  }

  function onSelectContact(c: Contact) {
    setContact(c);
    if (c.company?.id) {
      setCompanyId(c.company.id);
      setCompanyName(c.company.name ?? null);
    }
    goToStep(2);
  }

  function onClearContact() {
    setContact(null);
    setSelectedProfileId(null);
    setDeliveryMethod("PICKUP");
    goToStep(1);
  }

  function validateStep(target: OrderWizardStep): boolean {
    if (target >= 2 && !contact) {
      Alert.alert(t("common.error"), t("orderCreate.needClient"));
      return false;
    }
    if (target >= 3 && lines.length === 0) {
      Alert.alert(t("common.error"), t("orderCreate.needItems"));
      return false;
    }
    if (target >= 4) {
      if (!paymentType) {
        Alert.alert(t("common.error"), t("orderCreate.needPaymentType"));
        return false;
      }
      if (paymentMethod === "FOP" && !bankAccountId) {
        Alert.alert(t("common.error"), t("orderCreate.needBankAccount"));
        return false;
      }
    }
    if (target >= 5 && deliveryMethod === "NOVA_POSHTA" && npEnabled && !selectedProfileId) {
      Alert.alert(t("common.error"), t("orderCreate.needNpProfile"));
      return false;
    }
    return true;
  }

  function goNext() {
    const next = Math.min(5, step + 1) as OrderWizardStep;
    if (!validateStep(next)) return;
    goToStep(next);
  }

  async function onSubmit() {
    if (!token || !contact || !paymentType) return;
    if (!validateStep(5)) return;

    setBusy(true);
    try {
      if (mode === "create") {
        const order = await createOrderFull(token, snapshot, npEnabled);
        Alert.alert(t("common.done"), t("orderCreate.created"), [
          { text: t("common.ok"), onPress: () => onDone(order.id) },
        ]);
      } else if (orderId) {
        await saveOrderFull(token, orderId, snapshot, originalLines, npEnabled);
        Alert.alert(t("common.done"), t("orders.saved"), [
          { text: t("common.ok"), onPress: () => onDone(orderId) },
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("403") || msg.toLowerCase().includes("forbidden")) {
        Alert.alert(t("common.error"), t("orders.editLocked"));
      } else {
        Alert.alert(t("common.error"), msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const footerLabel = useMemo(() => {
    if (step === 1) return t("orderCreate.selectClientFooter");
    if (lines.length > 0) {
      return t("orderCreate.totalLabel", { amount: formatBaseMoney(total, displayCurrency) });
    }
    return t("orderCreate.addProducts");
  }, [step, lines.length, total, displayCurrency]);

  if (loading) {
    return (
      <Screen gradient={false} padded={false} contentStyle={styles.flex}>
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} gradient={false} contentStyle={styles.flex}>
      <KeyboardAwareScrollView
        extraBottomInset={theme.layout.stickyFooterHeight + insets.bottom}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
          },
        ]}>
        <OrderCreateStepBar
          step={step}
          maxReached={maxReached}
          onStepPress={(s) => {
            if (s < step) goToStep(s);
          }}
        />

        {step === 1 && token ? (
          <OrderClientStep
            token={token}
            contact={contact}
            companyId={companyId}
            companyName={companyName}
            onSelect={onSelectContact}
            onClear={onClearContact}
          />
        ) : null}

        {step === 2 && contact && token ? (
          <>
            <SectionTitle title={t("orderCreate.stepProducts")} />
            <Text style={[theme.typography.caption, { fontWeight: "600", marginBottom: theme.spacing.sm }]}>
              {t("orderCreate.warehouse")}
            </Text>
            <WarehousePicker token={token} value={warehouseId} onChange={setWarehouseId} />
            <ProductPicker
              token={token}
              warehouseId={warehouseId}
              currency={displayCurrency}
              onSelect={onProductSelect}
            />
            {lines.length === 0 ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
            ) : (
              lines.map((line, index) => (
                <AnimatedListItem key={line.key} index={index}>
                  <OrderItemRow
                    item={line}
                    index={index}
                    currency={displayCurrency}
                    discountPresets={discountPresets}
                    onChange={(patch) =>
                      setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, ...patch } : l)))
                    }
                    onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  />
                </AnimatedListItem>
              ))
            )}
          </>
        ) : null}

        {step === 3 && token ? (
          <>
            <SectionTitle title={t("orderCreate.stepPayment")} />
            <PaymentTermsSection
              token={token}
              paymentType={paymentType}
              onPaymentTypeChange={setPaymentType}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              bankAccountId={bankAccountId}
              onBankAccountIdChange={setBankAccountId}
              paymentDueDate={paymentDueDate}
              onPaymentDueDateChange={setPaymentDueDate}
            />
            <DocumentsToggle value={documentsRequested} onChange={setDocumentsRequested} />
          </>
        ) : null}

        {step === 4 && contact && token ? (
          <>
            <SectionTitle title={t("orderCreate.stepDelivery")} />
            <DeliveryMethodSection
              token={token}
              contact={contact}
              npEnabled={npEnabled}
              deliveryMethod={deliveryMethod}
              onDeliveryMethodChange={setDeliveryMethod}
              selectedProfileId={selectedProfileId}
              onSelectProfileId={setSelectedProfileId}
              onProfilesChange={setShippingProfiles}
              comment={comment}
              onCommentChange={setComment}
            />
          </>
        ) : null}

        {step === 5 && contact ? (
          <OrderReviewStep
            contact={contact}
            companyName={companyName}
            lines={lines}
            currency={displayCurrency}
            discountAmount={discountAmount}
            paymentType={paymentType}
            deliveryMethod={deliveryMethod}
            shippingProfile={deliveryMethod === "NOVA_POSHTA" ? selectedShippingProfile : null}
            comment={comment}
          />
        ) : null}
      </KeyboardAwareScrollView>

      <OrderStickyFooter
        totalLabel={footerLabel}
        actionLabel={step < 5 ? t("common.next") : mode === "create" ? t("orders.create") : t("common.save")}
        onAction={() => (step < 5 ? goNext() : void onSubmit())}
        disabled={step === 5 && (!contact || lines.length === 0)}
        loading={busy}
        secondaryLabel={step > 1 ? t("common.back") : undefined}
        onSecondary={step > 1 ? () => goToStep(Math.max(1, step - 1) as OrderWizardStep) : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {},
});
