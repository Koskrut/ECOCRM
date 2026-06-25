import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { TaskRow } from "@/components/TaskRow";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "expo-router";
import { tasksApi } from "@/lib/api/tasks";
import { addDays, endOfLocalDayIso, startOfLocalDayIso } from "@/lib/date";
import { enqueueOfflineJob, isOfflineLikeError } from "@/lib/offline-queue";
import { t } from "@/lib/i18n";
import type { Task, TaskStatus } from "@/types/crm";

type FilterKey = "today" | "overdue" | "all";

const OPEN_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];

export default function TasksScreen() {
  const router = useRouter();
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
        Alert.alert(t("common.done"), "Дію додано в офлайн-чергу.");
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
        Alert.alert(t("common.done"), "Дію додано в офлайн-чергу.");
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
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{t("tasks.title")}</Text>
        <Pressable
          onPress={() => router.push("/tasks/new")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.headerBtnText}>+ Завдання</Text>
        </Pressable>
      </View>
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            accessibilityRole="button">
            <Text style={filter === f.key ? styles.chipTextActive : undefined}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={items}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  heading: { fontSize: 26, fontWeight: "700", marginBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerBtn: { backgroundColor: "rgba(37,99,235,0.12)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  headerBtnText: { color: "#1d4ed8", fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipActive: { backgroundColor: "#dbeafe", borderColor: "#2563eb" },
  chipTextActive: { fontWeight: "600", color: "#1d4ed8" },
});
