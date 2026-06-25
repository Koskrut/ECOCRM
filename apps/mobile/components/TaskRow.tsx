import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { t } from "@/lib/i18n";
import type { Task } from "@/types/crm";

function formatDue(dueAt: string | null | undefined): string {
  if (!dueAt) return t("tasks.noDue");
  const d = new Date(dueAt);
  return d.toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TaskRowProps = {
  task: Task;
  onPress?: () => void;
  onComplete?: () => void;
  onReschedule?: () => void;
  busy?: boolean;
};

export function TaskRow({ task, onPress, onComplete, onReschedule, busy }: TaskRowProps) {
  const contactName = task.contact
    ? [task.contact.firstName, task.contact.lastName].filter(Boolean).join(" ")
    : task.company?.name;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, onPress && pressed && styles.pressed]}>
      <Text style={styles.title}>{task.title}</Text>
      <Text style={styles.meta}>
        {t("tasks.due")}: {formatDue(task.dueAt)}
        {contactName ? ` · ${contactName}` : ""}
      </Text>
      {task.body ? <Text style={styles.body}>{task.body}</Text> : null}
      {task.status !== "DONE" && task.status !== "CANCELED" ? (
        <View style={styles.actions}>
          {onComplete ? (
            <Pressable
              disabled={busy}
              onPress={onComplete}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
              accessibilityRole="button">
              <Text style={styles.btnPrimaryText}>{busy ? "…" : t("tasks.complete")}</Text>
            </Pressable>
          ) : null}
          {onReschedule ? (
            <Pressable
              disabled={busy}
              onPress={onReschedule}
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
              accessibilityRole="button">
              <Text style={styles.btnGhostText}>{t("tasks.reschedule")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.done}>{t("tasks.completed")}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 10,
  },
  title: { fontWeight: "600", fontSize: 16 },
  meta: { opacity: 0.7, marginTop: 6, fontSize: 13 },
  body: { marginTop: 8, fontSize: 14, lineHeight: 20, opacity: 0.85 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnPrimary: { backgroundColor: "#2563eb" },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: "#94a3b8" },
  btnGhostText: { fontWeight: "600", fontSize: 14 },
  done: { marginTop: 8, fontSize: 13, opacity: 0.6, fontStyle: "italic" },
  pressed: { opacity: 0.75 },
});
