import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Chip } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/TextField";
import type { ManualCallOutcome } from "@/lib/api/manual-calling";
import { useTheme } from "@/lib/design/theme-context";
import { CALL_OUTCOMES, callOutcomeLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (outcome: ManualCallOutcome, note: string, callbackAt?: string) => void;
  loading?: boolean;
};

export function CallOutcomeSheet({ visible, onClose, onSubmit, loading }: Props) {
  const theme = useTheme();
  const [outcome, setOutcome] = useState<ManualCallOutcome>("NO_ANSWER");
  const [note, setNote] = useState("");
  const [callbackDate, setCallbackDate] = useState("");

  function handleSubmit() {
    const callbackAt =
      outcome === "REQUESTED_CALLBACK" && callbackDate.trim()
        ? new Date(callbackDate.trim()).toISOString()
        : undefined;
    onSubmit(outcome, note.trim(), callbackAt);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("calls.outcomeTitle")}>
      <View style={styles.chips}>
        <View style={styles.chipRow}>
          {CALL_OUTCOMES.map((code) => (
            <Chip
              key={code}
              label={callOutcomeLabel(code)}
              selected={outcome === code}
              onPress={() => setOutcome(code)}
            />
          ))}
        </View>
      </View>
      {outcome === "REQUESTED_CALLBACK" ? (
        <TextField
          value={callbackDate}
          onChangeText={setCallbackDate}
          placeholder={t("calls.callbackPlaceholder")}
        />
      ) : null}
      <TextField
        value={note}
        onChangeText={setNote}
        placeholder={t("calls.notePlaceholder")}
        multiline
        style={styles.note}
      />
      <View style={[styles.actions, { gap: theme.spacing.sm, marginTop: theme.spacing.lg }]}>
        <AppButton label={t("common.cancel")} onPress={onClose} variant="secondary" style={styles.btn} />
        <AppButton
          label={t("common.save")}
          onPress={handleSubmit}
          loading={loading}
          style={styles.btn}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chips: { marginBottom: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  note: { minHeight: 72, textAlignVertical: "top" },
  actions: { flexDirection: "row" },
  btn: { flex: 1 },
});
