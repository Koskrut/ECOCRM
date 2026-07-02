import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import {
  isGenericShippingLabel,
  shippingProfileAddressDetail,
  shippingProfileLocationLine,
  shippingProfilePhone,
  shippingProfileRecipientName,
  shippingProfileRecipientSubtitle,
} from "@/lib/shipping-profile-format";
import { t } from "@/lib/i18n";
import type { ContactShippingProfile } from "@/types/crm";

type Props = {
  profile: ContactShippingProfile;
  variant?: "row" | "preview" | "compact";
};

export function ShippingProfileSummary({ profile, variant = "row" }: Props) {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        labelRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
        label: { fontWeight: "700", fontSize: 15, color: theme.colors.text },
        badge: {
          fontSize: 11,
          fontWeight: "600",
          color: theme.colors.primary,
          backgroundColor: theme.colors.primaryMuted,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
          overflow: "hidden",
        },
        meta: { marginTop: 4, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
        metaStrong: { color: theme.colors.text, fontWeight: "500" },
        previewCard: {
          marginTop: 10,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        previewTitle: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 6 },
        previewLine: { fontSize: 14, color: theme.colors.text, lineHeight: 20, marginTop: 4 },
        previewLabel: { color: theme.colors.textMuted },
        compactBlock: { marginTop: 4 },
      }),
    [theme],
  );

  const recipient = shippingProfileRecipientName(profile);
  const recipientSubtitle = shippingProfileRecipientSubtitle(profile);
  const phone = shippingProfilePhone(profile);
  const location = shippingProfileLocationLine(profile);
  const address = shippingProfileAddressDetail(profile);
  const showLabel = profile.label?.trim() && !isGenericShippingLabel(profile.label);

  if (variant === "compact") {
    return (
      <View style={styles.compactBlock}>
        {showLabel ? <Text style={styles.metaStrong}>{profile.label}</Text> : null}
        {recipient ? <Text style={styles.meta}>{recipient}</Text> : null}
        {recipientSubtitle ? <Text style={styles.meta}>{recipientSubtitle}</Text> : null}
        {phone ? <Text style={styles.meta}>{phone}</Text> : null}
        <Text style={styles.meta}>{location}</Text>
        {address ? <Text style={styles.meta}>{address}</Text> : null}
      </View>
    );
  }

  if (variant === "preview") {
    return (
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>{t("shipping.preview")}</Text>
        {showLabel ? <Text style={[styles.previewLine, { fontWeight: "600" }]}>{profile.label}</Text> : null}
        <Text style={styles.previewLine}>
          <Text style={styles.previewLabel}>{t("shipping.recipient")}: </Text>
          {recipient ?? "—"}
        </Text>
        {recipientSubtitle ? (
          <Text style={styles.previewLine}>
            <Text style={styles.previewLabel}>{t("shipping.company")}: </Text>
            {recipientSubtitle}
          </Text>
        ) : null}
        <Text style={styles.previewLine}>
          <Text style={styles.previewLabel}>{t("shipping.phone")}: </Text>
          {phone ?? "—"}
        </Text>
        <Text style={styles.previewLine}>{location}</Text>
        {address ? <Text style={styles.previewLine}>{address}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      {showLabel || profile.isDefault ? (
        <View style={styles.labelRow}>
          {showLabel ? <Text style={styles.label}>{profile.label}</Text> : null}
          {profile.isDefault ? <Text style={styles.badge}>{t("shipping.default")}</Text> : null}
        </View>
      ) : null}
      {recipient ? <Text style={[styles.meta, styles.metaStrong]}>{recipient}</Text> : null}
      {recipientSubtitle ? <Text style={styles.meta}>{recipientSubtitle}</Text> : null}
      {phone ? <Text style={styles.meta}>{phone}</Text> : null}
      <Text style={styles.meta}>{location}</Text>
      {address ? <Text style={styles.meta}>{address}</Text> : null}
    </View>
  );
}
