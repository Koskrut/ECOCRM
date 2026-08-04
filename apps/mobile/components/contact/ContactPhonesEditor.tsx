import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { contactsApi } from "@/lib/api/contacts";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type PhoneItem = { id: string; phone: string; label?: string | null };

type Props = {
  token: string;
  contactId: string;
  primaryPhone: string;
  additional: PhoneItem[];
  onChanged: () => void;
  disabled?: boolean;
};

export function ContactPhonesEditor({
  token,
  contactId,
  primaryPhone,
  additional,
  onChanged,
  disabled,
}: Props) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onAdd() {
    if (!phone.trim()) {
      Alert.alert(t("common.error"), t("contacts.phoneRequired"));
      return;
    }
    setBusyId("add");
    try {
      await contactsApi.addPhone(token, contactId, {
        phone: phone.trim(),
        label: label.trim() || null,
      });
      setPhone("");
      setLabel("");
      setAdding(false);
      onChanged();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onSetPrimary(phoneId: string) {
    setBusyId(phoneId);
    try {
      await contactsApi.setPrimaryPhone(token, contactId, phoneId);
      onChanged();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(phoneId: string) {
    Alert.alert(t("contacts.deletePhoneTitle"), t("contacts.deletePhoneBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyId(phoneId);
            try {
              await contactsApi.deletePhone(token, contactId, phoneId);
              onChanged();
            } catch (e) {
              Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  }

  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={[theme.typography.caption, { fontWeight: "600", marginBottom: 6 }]}>
        {t("clients.additionalPhones")}
      </Text>
      {primaryPhone ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
          {t("clients.primaryPhoneHint", { phone: primaryPhone })}
        </Text>
      ) : null}

      {additional.map((p) => (
        <Card key={p.id} style={{ marginBottom: 8 }}>
          <Text style={theme.typography.body}>
            {p.phone}
            {p.label ? (
              <Text style={{ color: theme.colors.textMuted }}> ({p.label})</Text>
            ) : null}
          </Text>
          <View style={styles.row}>
            <AppButton
              label={t("contacts.setPrimaryPhone")}
              variant="ghost"
              disabled={disabled || busyId !== null}
              loading={busyId === p.id}
              onPress={() => void onSetPrimary(p.id)}
            />
            <AppButton
              label={t("common.delete")}
              variant="ghost"
              disabled={disabled || busyId !== null}
              onPress={() => onDelete(p.id)}
            />
          </View>
        </Card>
      ))}

      {adding ? (
        <View>
          <TextField
            label={t("clients.phone")}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder={t("clients.phoneRequiredField")}
          />
          <TextField
            label={t("contacts.phoneLabel")}
            value={label}
            onChangeText={setLabel}
            placeholder={t("contacts.phoneLabelOptional")}
          />
          <View style={styles.row}>
            <AppButton
              label={t("common.save")}
              loading={busyId === "add"}
              disabled={disabled}
              onPress={() => void onAdd()}
            />
            <AppButton
              label={t("common.cancel")}
              variant="ghost"
              disabled={busyId !== null}
              onPress={() => {
                setAdding(false);
                setPhone("");
                setLabel("");
              }}
            />
          </View>
        </View>
      ) : (
        <AppButton
          label={t("contacts.addPhone")}
          variant="secondary"
          disabled={disabled}
          onPress={() => setAdding(true)}
          style={{ alignSelf: "flex-start" }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
});
