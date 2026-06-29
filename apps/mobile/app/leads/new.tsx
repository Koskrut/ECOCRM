import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, StyleSheet } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { leadsApi } from "@/lib/api/leads";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export default function NewLeadScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    if (!phone.trim() && !name.trim() && !companyName.trim()) {
      Alert.alert(t("common.error"), t("leads.validationRequired"));
      return;
    }
    setBusy(true);
    try {
      await leadsApi.create(token, {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        companyName: companyName.trim() || undefined,
        message: message.trim() || undefined,
        source: "MANUAL",
      });
      Alert.alert(t("common.done"), t("leads.created"), [
        { text: t("common.ok"), onPress: () => router.back() },
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
          placeholder={t("leads.nameOptional")}
        />
        <TextField
          value={phone}
          onChangeText={setPhone}
          placeholder={t("leads.phoneOptional")}
          keyboardType="phone-pad"
        />
        <TextField
          value={companyName}
          onChangeText={setCompanyName}
          placeholder={t("leads.companyOptional")}
        />
        <TextField
          value={message}
          onChangeText={setMessage}
          placeholder={t("leads.messageOptional")}
          multiline
          style={{ minHeight: 90, textAlignVertical: "top" }}
        />
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
