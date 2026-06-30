import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Chip } from "@/components/ui/Chip";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Task, TaskStatus } from "@/types/crm";

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

function isOverdue(dueAt: string | null | undefined, status: TaskStatus): boolean {
  if (!dueAt || status === "DONE" || status === "CANCELED") return false;
  return new Date(dueAt).getTime() < Date.now();
}

function statusLabel(status: TaskStatus): string {
  return t(`tasks.status.${status}`);
}

type TaskRowProps = {
  task: Task;
  onPress?: () => void;
  onComplete?: () => void;
  onReschedule?: () => void;
  busy?: boolean;
  index?: number;
};

export function TaskRow({ task, onPress, onComplete, onReschedule, busy, index = 0 }: TaskRowProps) {
  const theme = useTheme();
  const contactName = task.contact
    ? [task.contact.firstName, task.contact.lastName].filter(Boolean).join(" ")
    : task.company?.name;
  const overdue = isOverdue(task.dueAt, task.status);
  const closed = task.status === "DONE" || task.status === "CANCELED";

  return (
    <AnimatedListItem index={index}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            ...theme.elevation.sm,
          },
          onPress && pressed && styles.pressed,
        ]}>
        <View style={styles.titleRow}>
          <Text style={[theme.typography.bodyMedium, { flex: 1 }]}>{task.title}</Text>
          <Chip
            label={statusLabel(task.status)}
            selected={task.status === "OPEN" || task.status === "IN_PROGRESS"}
          />
        </View>
        <Text
          style={[
            theme.typography.caption,
            {
              color: overdue ? theme.colors.dangerText : theme.colors.textMuted,
              marginTop: 6,
            },
          ]}>
          {t("tasks.due")}: {formatDue(task.dueAt)}
          {overdue ? ` · ${t("tasks.overdue")}` : ""}
          {contactName ? ` · ${contactName}` : ""}
        </Text>
        {task.body ? (
          <Text style={[theme.typography.body, { marginTop: 8, color: theme.colors.textMuted }]}>
            {task.body}
          </Text>
        ) : null}
        {!closed ? (
          <View style={styles.actions}>
            {onComplete ? (
              <Chip
                label={busy ? t("common.loading") : t("tasks.complete")}
                onPress={onComplete}
                selected
              />
            ) : null}
            {onReschedule ? (
              <Chip label={t("tasks.reschedule")} onPress={onReschedule} />
            ) : null}
          </View>
        ) : (
          <Text
            style={[
              theme.typography.caption,
              {
                marginTop: 8,
                color:
                  task.status === "CANCELED" ? theme.colors.textMuted : theme.colors.successText,
              },
            ]}>
            {task.status === "CANCELED" ? t("tasks.canceled") : t("tasks.completed")}
          </Text>
        )}
      </Pressable>
    </AnimatedListItem>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  pressed: { opacity: 0.82 },
});
