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
  resolveApiBaseUrl,
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
        let url = await hydrateApiBaseUrl();
        // Migrate web CRM roots saved without `/api` (e.g. https://crm.example.com → …/api).
        if (url) {
          try {
            const path = new URL(url).pathname.replace(/\/+$/, "");
            if (!path) {
              const resolved = await resolveApiBaseUrl(url);
              if (resolved !== url) {
                url = await setApiBaseUrl(resolved);
              }
            }
          } catch {
            /* keep stored URL; login/setup will surface errors */
          }
        }
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
    const resolved = await resolveApiBaseUrl(url);
    const normalized = await setApiBaseUrl(resolved);
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
