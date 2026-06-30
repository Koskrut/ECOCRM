import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Chip } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { visitsApi } from "@/lib/api/visits";
import { useTheme } from "@/lib/design/theme-context";
import { captureGpsForVisitRequest } from "@/lib/gps-capture";
import {
  visitOutcomeLabel,
  VISIT_OUTCOMES,
  type VisitOutcome,
} from "@/lib/labels";
import { enqueueOfflineJob, isOfflineLikeError } from "@/lib/offline-queue";
import { t } from "@/lib/i18n";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function LogAdHocVisitSheet({ visible, onClose, onSuccess }: Props) {
  const theme = useTheme();
  const { token } = useAuth();

  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [outcome, setOutcome] = useState<VisitOutcome>("SUCCESS");
  const [resultNote, setResultNote] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setPhone("");
    setFirstName("");
    setLastName("");
    setOutcome("SUCCESS");
    setResultNote("");
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function onSubmit() {
    if (!token) return;
    if (!phone.trim() || !firstName.trim() || !lastName.trim() || !resultNote.trim()) {
      Alert.alert(t("common.error"), t("visit.logAdHoc.validation"));
      return;
    }
    setBusy(true);
    try {
      const gps = await captureGpsForVisitRequest();
      await visitsApi.logAdHoc(token, {
        phone: phone.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        outcome,
        resultNote: resultNote.trim(),
        ...(gps ?? {}),
      });
      reset();
      onClose();
      onSuccess?.();
      Alert.alert(t("common.done"), t("visit.logAdHoc.saved"));
    } catch (e) {
      if (isOfflineLikeError(e)) {
        const gps = await captureGpsForVisitRequest().catch(() => undefined);
        await enqueueOfflineJob("visitLogAdHoc", {
          body: {
            phone: phone.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            outcome,
            resultNote: resultNote.trim(),
            ...(gps ?? {}),
          },
        });
        reset();
        onClose();
        onSuccess?.();
        Alert.alert(t("common.done"), t("common.offlineQueued"));
      } else {
        Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={t("visit.logAdHoc.title")}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.md }]}>
        {t("visit.logAdHoc.subtitle")}
      </Text>
      <TextField
        value={phone}
        onChangeText={setPhone}
        placeholder={t("clients.phoneRequiredField")}
        keyboardType="phone-pad"
      />
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
      <Text style={[theme.typography.caption, { marginTop: theme.spacing.sm, marginBottom: theme.spacing.xs, fontWeight: "600" }]}>
        {t("visit.outcome")}
      </Text>
      <View style={styles.row}>
        {VISIT_OUTCOMES.map((code) => (
          <Chip
            key={code}
            label={visitOutcomeLabel(code)}
            selected={outcome === code}
            onPress={() => setOutcome(code)}
          />
        ))}
      </View>
      <TextField
        label={t("visit.comment")}
        value={resultNote}
        onChangeText={setResultNote}
        placeholder={t("visit.commentPlaceholder")}
        multiline
        style={{ minHeight: 100, marginTop: theme.spacing.sm }}
      />
      <AppButton
        label={t("visit.logAdHoc.submit")}
        onPress={() => void onSubmit()}
        loading={busy}
        fullWidth
        style={{ marginTop: theme.spacing.md }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
