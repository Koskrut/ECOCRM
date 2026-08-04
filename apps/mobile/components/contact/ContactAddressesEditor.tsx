import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { contactsApi } from "@/lib/api/contacts";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { CompanyAddress } from "@/types/crm";

type Props = {
  token: string;
  contactId: string;
  disabled?: boolean;
};

export function ContactAddressesEditor({ token, contactId, disabled }: Props) {
  const theme = useTheme();
  const [items, setItems] = useState<CompanyAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addressText, setAddressText] = useState("");
  const [city, setCity] = useState("");
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await contactsApi.listAddresses(token, contactId);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd() {
    if (!addressText.trim()) {
      Alert.alert(t("common.error"), t("contacts.addressRequired"));
      return;
    }
    setBusyId("add");
    try {
      await contactsApi.createAddress(token, contactId, {
        addressText: addressText.trim(),
        city: city.trim() || null,
        label: label.trim() || null,
        isDefault: items.length === 0,
      });
      setAddressText("");
      setCity("");
      setLabel("");
      setAdding(false);
      await load();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onSetDefault(addressId: string) {
    setBusyId(addressId);
    try {
      await contactsApi.setDefaultAddress(token, contactId, addressId);
      await load();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  function onDelete(addressId: string) {
    Alert.alert(t("contacts.deleteAddressTitle"), t("contacts.deleteAddressBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyId(addressId);
            try {
              await contactsApi.deleteAddress(token, contactId, addressId);
              await load();
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
        {t("clients.addresses")}
      </Text>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : items.length === 0 ? (
        <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginBottom: 8 }]}>
          {t("contacts.noAddresses")}
        </Text>
      ) : (
        items.map((a) => (
          <Card key={a.id} style={{ marginBottom: 8 }}>
            <Text style={theme.typography.body}>{a.displayLine || a.addressText}</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {[a.label, a.isDefault ? t("companies.defaultAddress") : null, a.hasCoordinates ? "GPS" : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View style={styles.row}>
              {!a.isDefault ? (
                <AppButton
                  label={t("contacts.setDefaultAddress")}
                  variant="ghost"
                  disabled={disabled || busyId !== null}
                  loading={busyId === a.id}
                  onPress={() => void onSetDefault(a.id)}
                />
              ) : null}
              <AppButton
                label={t("common.delete")}
                variant="ghost"
                disabled={disabled || busyId !== null}
                onPress={() => onDelete(a.id)}
              />
            </View>
          </Card>
        ))
      )}

      {adding ? (
        <View>
          <TextField
            label={t("clients.address")}
            value={addressText}
            onChangeText={setAddressText}
            placeholder={t("clients.address")}
            multiline
            style={{ minHeight: 72, textAlignVertical: "top" }}
          />
          <TextField
            label={t("clients.city")}
            value={city}
            onChangeText={setCity}
            placeholder={t("clients.city")}
          />
          <TextField
            label={t("contacts.addressLabel")}
            value={label}
            onChangeText={setLabel}
            placeholder={t("contacts.addressLabelOptional")}
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
                setAddressText("");
                setCity("");
                setLabel("");
              }}
            />
          </View>
        </View>
      ) : (
        <AppButton
          label={t("contacts.addAddress")}
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
