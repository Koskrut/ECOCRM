import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Chip } from "@/components/ui/Chip";
import { useTheme } from "@/lib/design/theme-context";
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
  index?: number;
};

export function TaskRow({ task, onPress, onComplete, onReschedule, busy, index = 0 }: TaskRowProps) {
  const theme = useTheme();
  const contactName = task.contact
    ? [task.contact.firstName, task.contact.lastName].filter(Boolean).join(" ")
    : task.company?.name;

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
        <Text style={theme.typography.bodyMedium}>{task.title}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>
          {t("tasks.due")}: {formatDue(task.dueAt)}
          {contactName ? ` · ${contactName}` : ""}
        </Text>
        {task.body ? (
          <Text style={[theme.typography.body, { marginTop: 8, color: theme.colors.textMuted }]}>
            {task.body}
          </Text>
        ) : null}
        {task.status !== "DONE" && task.status !== "CANCELED" ? (
          <View style={styles.actions}>
            {onComplete ? (
              <Chip label={busy ? "…" : t("tasks.complete")} onPress={onComplete} selected />
            ) : null}
            {onReschedule ? (
              <Chip label={t("tasks.reschedule")} onPress={onReschedule} />
            ) : null}
          </View>
        ) : (
          <Text style={[theme.typography.caption, { marginTop: 8, color: theme.colors.successText }]}>
            {t("tasks.completed")}
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
  actions: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  pressed: { opacity: 0.82 },
});
