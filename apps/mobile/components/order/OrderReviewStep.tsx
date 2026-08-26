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
import { formatBaseMoney } from "@/lib/order-currency";
import { computeLineTotal, parsePromoType, promoEligibilityQty, roundMoney } from "@/lib/order-line-total";
import { t } from "@/lib/i18n";
import type { Contact, ContactShippingProfile, DraftOrderLine } from "@/types/crm";

type Props = {
  contact: Contact;
  companyName?: string | null;
  lines: DraftOrderLine[];
  currency: string;
  discountAmount: number;
  paymentType: string | null;
  deliveryMethod: DeliveryMethod;
  shippingProfile?: ContactShippingProfile | null;
  comment: string;
};

function lineAmount(line: DraftOrderLine, all: DraftOrderLine[]): number {
  const promo = parsePromoType(line.promoType);
  const elig = promo ? promoEligibilityQty(promo, line, all) : line.qty;
  return roundMoney(computeLineTotal(line.qty, line.price, line.discountPercent, promo, elig));
}

export function OrderReviewStep({
  contact,
  companyName,
  lines,
  currency,
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
        {lines.map((line, index) => (
          <Text
            key={line.key}
            style={[theme.typography.caption, { marginLeft: 8, marginBottom: 4, color: theme.colors.textMuted }]}>
            {index + 1}. {line.productSku ? `${line.productSku} · ` : ""}
            {line.productName} × {line.qty} = {formatBaseMoney(lineAmount(line, lines), currency)}
          </Text>
        ))}
        <Text style={[theme.typography.body, { marginBottom: 8 }]}>
          <Text style={{ fontWeight: "700" }}>{t("orderCreate.reviewTotal")}: </Text>
          {formatBaseMoney(total, currency)}
          {discountAmount > 0 ? ` (−${formatBaseMoney(discountAmount, currency)} ${t("orderCreate.reviewDiscount")})` : ""}
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
