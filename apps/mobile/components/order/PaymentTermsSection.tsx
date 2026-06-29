import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Text } from "@/components/Themed";
import { bankAccountsApi } from "@/lib/api/bank-accounts";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import { addDays } from "@/lib/date";

type Props = {
  token: string;
  paymentType: string | null;
  onPaymentTypeChange: (v: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (v: string) => void;
  bankAccountId: string | null;
  onBankAccountIdChange: (v: string | null) => void;
  paymentDueDate: string;
  onPaymentDueDateChange: (v: string) => void;
};

export function PaymentTermsSection({
  token,
  paymentType,
  onPaymentTypeChange,
  paymentMethod,
  onPaymentMethodChange,
  bankAccountId,
  onBankAccountIdChange,
  paymentDueDate,
  onPaymentDueDateChange,
}: Props) {
  const theme = useTheme();
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await bankAccountsApi.forOrder(token);
        const { accounts: list, defaultBankAccountId } = bankAccountsApi.normalizeForOrder(raw);
        setAccounts(list);
        if (defaultBankAccountId) onBankAccountIdChange(defaultBankAccountId);
      } catch {
        setAccounts([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const chipStyle = (on: boolean) => [
    styles.chip,
    { borderColor: theme.colors.border },
    on && { backgroundColor: theme.colors.orderMuted, borderColor: theme.colors.order },
  ];

  const chipTextStyle = (on: boolean) => [
    styles.chipText,
    { color: theme.colors.text },
    on && { fontWeight: "700" as const, color: theme.colors.order },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.paymentType")} *</Text>
      <View style={styles.row}>
        {(["PREPAYMENT", "DEFERRED"] as const).map((pt) => (
          <Pressable
            key={pt}
            onPress={() => onPaymentTypeChange(pt)}
            style={chipStyle(paymentType === pt)}
            accessibilityRole="button">
            <Text style={chipTextStyle(paymentType === pt)}>{t(`orderCreate.paymentType_${pt}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.paymentMethod")}</Text>
      <View style={styles.row}>
        {(["CASH", "FOP"] as const).map((pm) => (
          <Pressable
            key={pm}
            onPress={() => onPaymentMethodChange(pm)}
            style={chipStyle(paymentMethod === pm)}
            accessibilityRole="button">
            <Text style={chipTextStyle(paymentMethod === pm)}>{t(`orderCreate.paymentMethod_${pm}`)}</Text>
          </Pressable>
        ))}
      </View>

      {paymentMethod === "FOP" && accounts.length > 0 ? (
        <>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.bankAccount")}</Text>
          <View style={styles.row}>
            {accounts.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => onBankAccountIdChange(a.id)}
                style={chipStyle(bankAccountId === a.id)}
                accessibilityRole="button">
                <Text style={chipTextStyle(bankAccountId === a.id)}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {paymentType === "DEFERRED" ? (
        <>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.deferredDue")}</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => onPaymentDueDateChange(addDays(new Date(), 10).toISOString())}
              style={chipStyle(false)}
              accessibilityRole="button">
              <Text style={chipTextStyle(false)}>{t("orderCreate.dueIn10days")}</Text>
            </Pressable>
            <Pressable
              onPress={() => onPaymentDueDateChange(addDays(new Date(), 1).toISOString())}
              style={chipStyle(false)}
              accessibilityRole="button">
              <Text style={chipTextStyle(false)}>{t("tasks.tomorrow")}</Text>
            </Pressable>
          </View>
          <TextInput
            value={paymentDueDate}
            onChangeText={onPaymentDueDateChange}
            placeholder="ISO date"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontWeight: "600", marginTop: spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
});
