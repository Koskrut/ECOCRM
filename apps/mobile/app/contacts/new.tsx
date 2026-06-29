import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, StyleSheet } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export default function NewContactScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ companyId?: string }>();
  const companyId = typeof params.companyId === "string" && params.companyId ? params.companyId : null;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    if (!phone.trim()) {
      Alert.alert(t("common.error"), t("contacts.phoneRequired"));
      return;
    }
    setBusy(true);
    try {
      const c = await contactsApi.create(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() ? email.trim() : null,
        address: address.trim() ? address.trim() : null,
        companyId,
      });
      Alert.alert(t("common.done"), t("contacts.created"), [
        {
          text: t("common.ok"),
          onPress: () => router.replace(`/visits/new?contactId=${encodeURIComponent(c.id)}`),
        },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg },
        ]}>
        <TextField value={firstName} onChangeText={setFirstName} placeholder={t("clients.firstName")} />
        <TextField value={lastName} onChangeText={setLastName} placeholder={t("clients.lastName")} />
        <TextField
          value={phone}
          onChangeText={setPhone}
          placeholder={t("clients.phoneRequiredField")}
          keyboardType="phone-pad"
        />
        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder={t("clients.emailOptional")}
          autoCapitalize="none"
        />
        <TextField value={address} onChangeText={setAddress} placeholder={t("clients.addressOptional")} />
        <AppButton
          label={t("common.create")}
          onPress={() => void onCreate()}
          loading={busy}
          fullWidth
          style={{ marginTop: theme.spacing.sm }}
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8 },
});
