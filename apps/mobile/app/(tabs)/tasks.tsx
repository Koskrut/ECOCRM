import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { TaskRow } from "@/components/TaskRow";
import { AppHeader } from "@/components/ui/AppHeader";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "expo-router";
import { tasksApi } from "@/lib/api/tasks";
import { addDays, endOfLocalDayIso, startOfLocalDayIso } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { enqueueOfflineJob, isOfflineLikeError } from "@/lib/offline-queue";
import { t } from "@/lib/i18n";
import type { Task, TaskStatus } from "@/types/crm";

type FilterKey = "today" | "overdue" | "all" | "closed";

const OPEN_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];
const CLOSED_STATUSES: TaskStatus[] = ["DONE", "CANCELED"];

export default function TasksScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("today");
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      let query: Parameters<typeof tasksApi.list>[1];
      if (filter === "today") {
        query = {
          status: OPEN_STATUSES,
          dueFrom: startOfLocalDayIso(now),
          dueTo: endOfLocalDayIso(now),
        };
      } else if (filter === "overdue") {
        const yesterday = addDays(now, -1);
        query = {
          status: OPEN_STATUSES,
          dueTo: endOfLocalDayIso(yesterday),
        };
      } else if (filter === "closed") {
        query = { status: CLOSED_STATUSES };
      } else {
        query = { status: OPEN_STATUSES };
      }
      const res = await tasksApi.list(token, query);
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function onComplete(task: Task) {
    if (!token) return;
    setBusyId(task.id);
    try {
      await tasksApi.complete(token, task.id);
      await reload();
    } catch (e) {
      if (isOfflineLikeError(e)) {
        await enqueueOfflineJob("taskComplete", { taskId: task.id });
        Alert.alert(t("common.done"), t("common.offlineQueued"));
        await reload();
      } else {
        Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusyId(null);
    }
  }

  function onReschedule(task: Task) {
    if (!token) return;
    const presets = [
      { label: t("tasks.tomorrow"), days: 1 },
      { label: t("tasks.in3days"), days: 3 },
      { label: t("tasks.inWeek"), days: 7 },
    ];
    Alert.alert(
      t("tasks.rescheduleTitle"),
      task.title,
      [
        ...presets.map((p) => ({
          text: p.label,
          onPress: () => void rescheduleTask(task.id, addDays(new Date(), p.days)),
        })),
        { text: t("common.cancel"), style: "cancel" as const },
      ],
    );
  }

  async function rescheduleTask(id: string, due: Date) {
    if (!token) return;
    setBusyId(id);
    try {
      await tasksApi.update(token, id, { dueAt: due.toISOString() });
      await reload();
    } catch (e) {
      if (isOfflineLikeError(e)) {
        await enqueueOfflineJob("taskUpdate", { taskId: id, body: { dueAt: due.toISOString() } });
        Alert.alert(t("common.done"), t("common.offlineQueued"));
        await reload();
      } else {
        Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusyId(null);
    }
  }

  const filters: { key: FilterKey; label: string }[] = [
    { key: "today", label: t("tasks.filterToday") },
    { key: "overdue", label: t("tasks.filterOverdue") },
    { key: "all", label: t("tasks.filterAll") },
    { key: "closed", label: t("tasks.filterClosed") },
  ];

  return (
    <Screen>
      <AppHeader
        title={t("tasks.title")}
        actionLabel={t("tasks.addTask")}
        onAction={() => router.push("/tasks/new")}
        large={false}
      />

      <View style={[styles.filterRow, { marginBottom: theme.spacing.md }]}>
        {filters.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>

      <FlatList
        data={items}
        style={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={theme.colors.primary} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            message={error ?? t("tasks.empty")}
            onRetry={error ? reload : undefined}
          />
        }
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            busy={busyId === item.id}
            onPress={() => router.push(`/tasks/${item.id}`)}
            onComplete={() => void onComplete(item)}
            onReschedule={() => onReschedule(item)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  list: { flex: 1 },
});
