import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Text } from "@/components/Themed";
import type { ManualCallOutcome } from "@/lib/api/manual-calling";
import { colors, layout, radius, spacing } from "@/lib/design/tokens";
import { CALL_OUTCOMES, callOutcomeLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (outcome: ManualCallOutcome, note: string, callbackAt?: string) => void;
  loading?: boolean;
};

export function CallOutcomeSheet({ visible, onClose, onSubmit, loading }: Props) {
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Text style={styles.title}>{t("calls.outcomeTitle")}</Text>
        <ScrollView style={styles.chips} keyboardShouldPersistTaps="handled">
          <View style={styles.chipRow}>
            {CALL_OUTCOMES.map((code) => (
              <Pressable
                key={code}
                onPress={() => setOutcome(code)}
                style={[styles.chip, outcome === code && styles.chipOn]}
                accessibilityRole="button">
                <Text style={[styles.chipText, outcome === code && styles.chipTextOn]}>
                  {callOutcomeLabel(code)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        {outcome === "REQUESTED_CALLBACK" ? (
          <TextInput
            value={callbackDate}
            onChangeText={setCallbackDate}
            placeholder={t("calls.callbackPlaceholder")}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        ) : null}
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("calls.notePlaceholder")}
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, styles.note]}
        />
        <View style={styles.actions}>
          <PrimaryButton label={t("common.cancel")} onPress={onClose} variant="secondary" style={{ flex: 1 }} />
          <PrimaryButton
            label={t("common.save")}
            onPress={handleSubmit}
            loading={loading}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "75%",
  },
  title: { fontWeight: "700", fontSize: 18, marginBottom: spacing.md },
  chips: { maxHeight: 180 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.chip,
    minHeight: layout.minTouchTarget,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.callMuted },
  chipText: { fontSize: 13 },
  chipTextOn: { fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  note: { minHeight: 72, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
