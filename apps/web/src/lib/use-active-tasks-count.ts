"use client";

import { useEffect, useState } from "react";
import { authApi } from "@/lib/api/resources/auth";
import { ACTIVE_TASK_STATUSES, tasksApi } from "@/lib/api/resources/tasks";

const POLL_MS = 15_000;

export function useActiveTasksCount(enabled: boolean, refreshKey?: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;
    let userId: string | null = null;

    const refresh = async () => {
      try {
        if (!userId) {
          const me = await authApi.me();
          userId = me.user?.id ?? null;
        }
        if (!userId) {
          if (!cancelled) setCount(0);
          return;
        }
        const { total } = await tasksApi.list({
          assigneeId: userId,
          status: ACTIVE_TASK_STATUSES,
          page: 1,
          pageSize: 1,
        });
        if (!cancelled) setCount(total);
      } catch {
        if (!cancelled) setCount(0);
      }
    };

    void refresh();
    const id = window.setInterval(refresh, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refreshKey]);

  return count;
}
