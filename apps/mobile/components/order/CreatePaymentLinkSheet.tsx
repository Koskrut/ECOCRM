import React, { useEffect, useState } from "react";
import { Alert, Share, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TextField } from "@/components/ui/TextField";
import { paymentRequestsApi } from "@/lib/api/payment-requests";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { isForeignOrderCurrency, orderCurrencySymbol } from "@/lib/order-currency";
import { buildPublicPayUrl } from "@/lib/pay-url";

function defaultExpiresLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultAmount(debtAmount: number, currency: string, exchangeRate?: number | null): string {
  if (debtAmount <= 0) return "";
  if (isForeignOrderCurrency(currency) && exchangeRate != null && exchangeRate > 0) {
    return String((Math.round(debtAmount * exchangeRate * 100) / 100).toFixed(2));
  }
  return String(debtAmount.toFixed(2));
}

function isReceiverCodeHintError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("єдрпоу") ||
    m.includes("іпн") ||
    m.includes("fop") ||
    m.includes("receivercode") ||
    m.includes("nbu payment link") ||
    m.includes("bank account")
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  token: string;
  orderId: string;
  orderNumber: string;
  currency: string;
  exchangeRate?: number | null;
  debtAmount: number;
};

export function CreatePaymentLinkSheet({
  visible,
  onClose,
  token,
  orderId,
  orderNumber,
  currency,
  exchangeRate,
  debtAmount,
}: Props) {
  const theme = useTheme();
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiresLocal);
  const [receiverCode, setReceiverCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAmount(defaultAmount(debtAmount, currency, exchangeRate));
    setPurpose(orderNumber ? t("paymentLink.purposeDefault", { number: orderNumber }) : "");
    setExpiresLocal(defaultExpiresLocal());
    setReceiverCode("");
    setError(null);
    setSubmitting(false);
  }, [visible, debtAmount, currency, exchangeRate, orderNumber]);

  const parsedAmountForPreview = parseFloat(amount.replace(/,/g, "."));
  const orderEquivalent =
    isForeignOrderCurrency(currency) &&
    exchangeRate != null &&
    exchangeRate > 0 &&
    Number.isFinite(parsedAmountForPreview)
      ? Math.round((parsedAmountForPreview / exchangeRate) * 100) / 100
      : null;

  const amountLabel = isForeignOrderCurrency(currency) || currency === "UAH"
    ? t("paymentLink.amount")
    : t("paymentLink.amountCurrency", { currency: currency || "UAH" });

  async function handleSubmit() {
    const num = parseFloat(amount.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError(t("paymentLink.invalidAmount"));
      return;
    }
    const exp = new Date(expiresLocal);
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) {
      setError(t("paymentLink.invalidExpires"));
      return;
    }

    const rc = receiverCode.replace(/\D/g, "");
    if (receiverCode.trim() && rc.length !== 8 && rc.length !== 10) {
      setError(t("paymentLink.invalidReceiverCode"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body: {
        amount: number;
        purpose: string;
        expiresAt: string;
        receiverCode?: string;
      } = {
        amount: num,
        purpose: purpose.trim(),
        expiresAt: exp.toISOString(),
      };
      if (rc.length === 8 || rc.length === 10) {
        body.receiverCode = rc;
      }

      const result = await paymentRequestsApi.create(token, orderId, body);
      const url = buildPublicPayUrl(result.publicToken);
      if (!url) {
        setError(t("paymentLink.noPayUrl"));
        setSubmitting(false);
        return;
      }

      onClose();
      try {
        await Share.share({
          message: `${result.purpose}\n${url}`,
          url,
        });
      } catch {
        Alert.alert(t("common.error"), t("paymentLink.shareFailed"));
      }
      Alert.alert(t("paymentLink.created"), t("paymentLink.createdMessage"));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("paymentLink.title")}>
      <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
        {t("paymentLink.receiverCodeHint")}
      </Text>

      <TextField
        label={t("paymentLink.receiverCode")}
        value={receiverCode}
        onChangeText={setReceiverCode}
        placeholder={t("paymentLink.receiverCodePlaceholder")}
        keyboardType="number-pad"
        autoComplete="off"
      />

      <TextField
        label={amountLabel}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      {isForeignOrderCurrency(currency) ? (
        <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
          {t("paymentLink.foreignCurrencyHint")}
          {exchangeRate != null && exchangeRate > 0 ? (
            <>
              {" "}
              {t("paymentLink.foreignCurrencyRate", {
                rate: exchangeRate,
                symbol: orderCurrencySymbol(currency),
              })}
              {orderEquivalent != null
                ? ` ${t("paymentLink.foreignCurrencyEquivalent", {
                    amount: orderEquivalent.toFixed(2),
                    symbol: orderCurrencySymbol(currency),
                  })}`
                : ""}
            </>
          ) : (
            ` ${t("paymentLink.foreignCurrencyNoRate", { symbol: orderCurrencySymbol(currency) })}`
          )}
        </Text>
      ) : currency === "UAH" ? (
        <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
          {t("paymentLink.uahHint")}
        </Text>
      ) : null}

      <TextField
        label={t("paymentLink.purpose")}
        value={purpose}
        onChangeText={setPurpose}
        multiline
      />

      <TextField
        label={t("paymentLink.expires")}
        value={expiresLocal}
        onChangeText={setExpiresLocal}
        placeholder={t("paymentLink.expiresHint")}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {error ? (
        <View style={styles.errorWrap}>
          <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>{error}</Text>
          {isReceiverCodeHintError(error) ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {t("paymentLink.receiverCodeHint")}
            </Text>
          ) : null}
        </View>
      ) : null}

      <AppButton
        label={submitting ? t("paymentLink.submitting") : t("paymentLink.submit")}
        onPress={() => void handleSubmit()}
        loading={submitting}
        disabled={submitting}
        style={styles.submit}
      />
      <AppButton label={t("common.cancel")} onPress={onClose} variant="secondary" disabled={submitting} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: 8 },
  errorWrap: { marginBottom: 8 },
  submit: { marginTop: 4, marginBottom: 8 },
});
