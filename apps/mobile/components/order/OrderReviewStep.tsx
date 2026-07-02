import React from "react";
import { View } from "react-native";

import { contactDisplayName } from "@/components/ContactRow";
import { draftLinesTotal } from "@/components/OrderItemRow";
import { ShippingProfileSummary } from "@/components/ShippingProfileSummary";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { DeliveryMethod } from "@/components/order/DeliveryMethodSection";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Contact, ContactShippingProfile, DraftOrderLine } from "@/types/crm";

type Props = {
  contact: Contact;
  companyName?: string | null;
  lines: DraftOrderLine[];
  discountAmount: number;
  paymentType: string | null;
  deliveryMethod: DeliveryMethod;
  shippingProfile?: ContactShippingProfile | null;
  comment: string;
};

function lineAmount(line: DraftOrderLine): number {
  return line.qty * line.price * (1 - line.discountPercent / 100);
}

export function OrderReviewStep({
  contact,
  companyName,
  lines,
  discountAmount,
  paymentType,
  deliveryMethod,
  shippingProfile,
  comment,
}: Props) {
  const theme = useTheme();
  const total = draftLinesTotal(lines);

  return (
    <View>
      <SectionTitle title={t("orderCreate.stepReview")} />
      <Card variant="elevated">
        <Text style={[theme.typography.body, { marginBottom: 8 }]}>
          <Text style={{ fontWeight: "700" }}>{t("orderCreate.reviewClient")}: </Text>
          {contactDisplayName(contact)}
        </Text>
        {companyName || contact.company?.name ? (
          <Text style={[theme.typography.body, { marginBottom: 8 }]}>
            <Text style={{ fontWeight: "700" }}>{t("orderCreate.reviewCompany")}: </Text>
            {companyName ?? contact.company?.name}
          </Text>
        ) : null}
        <Text style={[theme.typography.body, { marginBottom: 8 }]}>
          <Text style={{ fontWeight: "700" }}>{t("orderCreate.reviewItems")}: </Text>
          {lines.length}
        </Text>
        {lines.map((line) => (
          <Text
            key={line.key}
            style={[theme.typography.caption, { marginLeft: 8, marginBottom: 4, color: theme.colors.textMuted }]}>
            · {line.productSku ? `${line.productSku} · ` : ""}
            {line.productName} × {line.qty} = {lineAmount(line).toFixed(2)}
          </Text>
        ))}
        <Text style={[theme.typography.body, { marginBottom: 8 }]}>
          <Text style={{ fontWeight: "700" }}>{t("orderCreate.reviewTotal")}: </Text>
          {total.toFixed(2)}
          {discountAmount > 0 ? ` (−${discountAmount} ${t("orderCreate.reviewDiscount")})` : ""}
        </Text>
        <Text style={[theme.typography.body, { marginBottom: 8 }]}>
          <Text style={{ fontWeight: "700" }}>{t("orderCreate.paymentType")}: </Text>
          {paymentType ? t(`orderCreate.paymentType_${paymentType}`) : "—"}
        </Text>
        <Text style={[theme.typography.body, { marginBottom: 8 }]}>
          <Text style={{ fontWeight: "700" }}>{t("orderCreate.deliveryMethod")}: </Text>
          {deliveryMethod === "NOVA_POSHTA" ? t("orders.novaPoshta") : t("orderCreate.pickup")}
        </Text>
        {deliveryMethod === "NOVA_POSHTA" && shippingProfile ? (
          <View style={{ marginBottom: 8, marginLeft: 8 }}>
            <Text style={[theme.typography.body, { fontWeight: "700", marginBottom: 4 }]}>
              {t("orderCreate.reviewDeliveryProfile")}:
            </Text>
            <ShippingProfileSummary profile={shippingProfile} variant="compact" />
          </View>
        ) : null}
        {comment ? (
          <Text style={theme.typography.body}>
            <Text style={{ fontWeight: "700" }}>{t("orderCreate.comment")}: </Text>
            {comment}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
