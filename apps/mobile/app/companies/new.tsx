import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, StyleSheet } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { companiesApi } from "@/lib/api/companies";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export default function NewCompanyScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [edrpou, setEdrpou] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("companies.nameRequired"));
      return;
    }
    setBusy(true);
    try {
      const company = await companiesApi.create(token, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        edrpou: edrpou.trim() || undefined,
      });
      Alert.alert(t("common.done"), t("companies.created"), [
        {
          text: t("common.ok"),
          onPress: () => router.replace(`/company/${encodeURIComponent(company.id)}`),
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
        <TextField
          value={name}
          onChangeText={setName}
          placeholder={t("companies.fields.name")}
        />
        <TextField
          value={phone}
          onChangeText={setPhone}
          placeholder={t("companies.fields.phone")}
          keyboardType="phone-pad"
        />
        <TextField value={address} onChangeText={setAddress} placeholder={t("companies.fields.address")} />
        <TextField value={edrpou} onChangeText={setEdrpou} placeholder={t("companies.fields.edrpou")} />
        <AppButton
          label={t("companies.createCompany")}
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
