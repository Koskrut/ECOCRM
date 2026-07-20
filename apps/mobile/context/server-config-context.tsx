import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearApiBaseUrl,
  getCachedApiBaseUrl,
  hydrateApiBaseUrl,
  probeApiBaseUrl,
  setApiBaseUrl,
} from "@/lib/config";

type ServerConfigCtx = {
  ready: boolean;
  apiUrl: string | null;
  setServerUrl: (url: string) => Promise<string>;
  /** Clear stored URL (next launch will show setup unless build-time seed applies). */
  clearServerUrl: () => Promise<void>;
};

const ServerConfigContext = createContext<ServerConfigCtx | null>(null);

export function ServerConfigProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [apiUrl, setApiUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await hydrateApiBaseUrl();
        if (!cancelled) {
          setApiUrl(url ?? getCachedApiBaseUrl());
        }
      } catch {
        if (!cancelled) setApiUrl(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    await probeApiBaseUrl(url);
    const normalized = await setApiBaseUrl(url);
    setApiUrl(normalized);
    return normalized;
  }, []);

  const clearServerUrl = useCallback(async () => {
    await clearApiBaseUrl();
    setApiUrl(null);
  }, []);

  const value = useMemo<ServerConfigCtx>(
    () => ({ ready, apiUrl, setServerUrl, clearServerUrl }),
    [ready, apiUrl, setServerUrl, clearServerUrl],
  );

  return (
    <ServerConfigContext.Provider value={value}>{children}</ServerConfigContext.Provider>
  );
}

export function useServerConfig(): ServerConfigCtx {
  const ctx = useContext(ServerConfigContext);
  if (!ctx) {
    throw new Error("useServerConfig must be inside ServerConfigProvider");
  }
  return ctx;
}
