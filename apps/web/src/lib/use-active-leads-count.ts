"use client";

import { useEffect, useState } from "react";
import { leadsApi } from "@/lib/api/resources/leads";

const POLL_MS = 15_000;

export function useActiveLeadsCount(enabled: boolean, refreshKey?: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const { total } = await leadsApi.list({ page: 1, pageSize: 1 });
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
