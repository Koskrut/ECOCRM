import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { activitiesApi } from "@/lib/api/activities";
import { t } from "@/lib/i18n";

export default function NewContactActivityScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const contactId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!token || !contactId) return;
    if (!body.trim()) {
      Alert.alert(t("common.error"), t("contacts.noteRequired"));
      return;
    }
    setBusy(true);
    try {
      await activitiesApi.createForContact(token, contactId, { kind: "NOTE", body: body.trim() });
      Alert.alert(t("common.done"), t("contacts.noteAdded"), [
        { text: t("common.ok"), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["left", "right", "bottom"]} padded>
      <KeyboardAwareScrollView>
        <TextField
          value={body}
          onChangeText={setBody}
          placeholder={t("contacts.notePlaceholder")}
          label={t("screens.noteNew")}
          multiline
          style={{ minHeight: 140, textAlignVertical: "top" }}
        />
        <AppButton label={busy ? "…" : t("common.save")} onPress={() => void onSave()} loading={busy} fullWidth />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
