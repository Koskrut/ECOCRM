import React from "react";
import { View } from "react-native";

import { contactDisplayName } from "@/components/ContactRow";
import { ContactPickerPanel } from "@/components/visit/ContactPickerPanel";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Contact } from "@/types/crm";

type Props = {
  token: string;
  contact: Contact | null;
  companyId?: string | null;
  companyName?: string | null;
  onSelect: (contact: Contact) => void;
  onClear: () => void;
};

export function OrderClientStep({ token, contact, companyId, companyName, onSelect, onClear }: Props) {
  const theme = useTheme();

  return (
    <View>
      <SectionTitle title={t("orderCreate.stepClient")} subtitle={t("orderCreate.clientSubtitle")} />
      {companyName ? (
        <Card variant="elevated" style={{ marginBottom: theme.spacing.md }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {t("orderCreate.companyContext")}
          </Text>
          <Text style={[theme.typography.bodyMedium, { marginTop: 4 }]}>{companyName}</Text>
        </Card>
      ) : null}
      {contact ? (
        <Card variant="elevated">
          <Text style={theme.typography.bodyMedium}>{contactDisplayName(contact)}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>
            {contact.company?.name ?? contact.phone ?? contact.address ?? ""}
          </Text>
          <AppButton
            label={t("orderCreate.changeClient")}
            onPress={onClear}
            variant="ghost"
            style={{ marginTop: theme.spacing.sm, alignSelf: "flex-start" }}
          />
        </Card>
      ) : (
        <ContactPickerPanel
          token={token}
          companyId={companyId ?? undefined}
          companyName={companyName ?? undefined}
          onSelect={onSelect}
          createContactLabel={
            companyId ? t("orderCreate.createContactForCompany") : undefined
          }
        />
      )}
    </View>
  );
}
