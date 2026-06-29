import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ShippingProfilePicker } from "@/components/ShippingProfilePicker";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import type { Contact } from "@/types/crm";

export type DeliveryMethod = "PICKUP" | "NOVA_POSHTA";

type Props = {
  token: string;
  contact: Contact;
  npEnabled: boolean;
  deliveryMethod: DeliveryMethod;
  onDeliveryMethodChange: (v: DeliveryMethod) => void;
  selectedProfileId: string | null;
  onSelectProfileId: (id: string | null) => void;
  comment: string;
  onCommentChange: (v: string) => void;
};

export function DeliveryMethodSection({
  token,
  contact,
  npEnabled,
  deliveryMethod,
  onDeliveryMethodChange,
  selectedProfileId,
  onSelectProfileId,
  comment,
  onCommentChange,
}: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.deliveryMethod")}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onDeliveryMethodChange("PICKUP")}
          style={[
            styles.chip,
            { borderColor: theme.colors.border },
            deliveryMethod === "PICKUP" && {
              backgroundColor: theme.colors.orderMuted,
              borderColor: theme.colors.order,
            },
          ]}
          accessibilityRole="button">
          <Text
            style={[
              styles.chipText,
              { color: theme.colors.text },
              deliveryMethod === "PICKUP" && { fontWeight: "700", color: theme.colors.order },
            ]}>
            {t("orderCreate.pickup")}
          </Text>
        </Pressable>
        {npEnabled ? (
          <Pressable
            onPress={() => onDeliveryMethodChange("NOVA_POSHTA")}
            style={[
              styles.chip,
              { borderColor: theme.colors.border },
              deliveryMethod === "NOVA_POSHTA" && {
                backgroundColor: theme.colors.orderMuted,
                borderColor: theme.colors.order,
              },
            ]}
            accessibilityRole="button">
            <Text
              style={[
                styles.chipText,
                { color: theme.colors.text },
                deliveryMethod === "NOVA_POSHTA" && { fontWeight: "700", color: theme.colors.order },
              ]}>
              Nova Poshta
            </Text>
          </Pressable>
        ) : null}
      </View>

      {deliveryMethod === "NOVA_POSHTA" && npEnabled ? (
        <Card style={{ marginTop: spacing.md }}>
          <ShippingProfilePicker
            token={token}
            contact={contact}
            selectedProfileId={selectedProfileId}
            onSelectProfileId={onSelectProfileId}
          />
        </Card>
      ) : null}

      <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.comment")}</Text>
      <TextInput
        value={comment}
        onChangeText={onCommentChange}
        placeholder={t("orderCreate.commentPlaceholder")}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.commentInput,
          {
            color: theme.colors.text,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
        multiline
      />
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
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
  },
});
