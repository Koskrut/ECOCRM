import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/context/auth-context";
import { flushOfflineJobs, listOfflineJobs, type OfflineJob } from "@/lib/offline-queue";

type OfflineQueueCtx = {
  ready: boolean;
  jobs: OfflineJob[];
  lastError: string | null;
  refresh: () => Promise<void>;
  flushNow: () => Promise<void>;
};

const OfflineQueueContext = createContext<OfflineQueueCtx | null>(null);

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const { token, ready: authReady } = useAuth();
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<OfflineJob[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listOfflineJobs();
      setJobs(list);
      setLastError(null);
    } catch {
      setJobs([]);
    } finally {
      setReady(true);
    }
  }, []);

  const flushNow = useCallback(async () => {
    if (!token) return;
    const res = await flushOfflineJobs({ token });
    setLastError(res.lastError);
    await refresh();
  }, [token, refresh]);

  useEffect(() => {
    if (!authReady) return;
    void refresh();
  }, [authReady, refresh]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      void flushNow().catch(() => {
        /* ignore */
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [token, flushNow]);

  const value = useMemo(
    () => ({ ready, jobs, lastError, refresh, flushNow }),
    [ready, jobs, lastError, refresh, flushNow],
  );

  return <OfflineQueueContext.Provider value={value}>{children}</OfflineQueueContext.Provider>;
}

export function useOfflineQueue(): OfflineQueueCtx {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error("useOfflineQueue must be inside OfflineQueueProvider");
  return ctx;
}

