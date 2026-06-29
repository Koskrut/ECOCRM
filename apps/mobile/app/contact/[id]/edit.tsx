import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Contact } from "@/types/crm";

export default function EditContactScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const contactId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !contactId) return;
    setLoading(true);
    try {
      const c = await contactsApi.getById(token, contactId);
      setContact(c);
      setFirstName(c.firstName ?? "");
      setLastName(c.lastName ?? "");
      setPhone(c.phone ?? "");
      setEmail(c.email ?? "");
      setAddress(c.address ?? "");
    } finally {
      setLoading(false);
    }
  }, [token, contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    if (!token || !contactId) return;
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      Alert.alert(t("common.error"), t("clients.validationRequired"));
      return;
    }
    setBusy(true);
    try {
      await contactsApi.patch(token, contactId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
      });
      Alert.alert(t("common.done"), t("common.save"), [
        { text: t("common.ok"), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !contact) {
    return (
      <Screen gradient={false} padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.md }]}>
            {t("common.loading")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg },
        ]}>
        <TextField
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t("clients.firstNameRequired")}
        />
        <TextField
          value={lastName}
          onChangeText={setLastName}
          placeholder={t("clients.lastNameRequired")}
        />
        <TextField
          value={phone}
          onChangeText={setPhone}
          placeholder={t("clients.phoneRequiredField")}
          keyboardType="phone-pad"
        />
        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder={t("clients.email")}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField
          value={address}
          onChangeText={setAddress}
          placeholder={t("clients.address")}
          multiline
          style={{ minHeight: 80, textAlignVertical: "top" }}
        />
        <AppButton
          label={t("common.save")}
          onPress={() => void onSave()}
          loading={busy}
          fullWidth
          style={{ marginTop: theme.spacing.sm }}
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { paddingTop: 8 },
});
