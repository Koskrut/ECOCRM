"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getStoreConfig, type StoreConfig } from "@/lib/api";

const defaultConfig: StoreConfig = {};

const StoreConfigContext = createContext<{
  config: StoreConfig;
  loading: boolean;
  reload: () => Promise<void>;
}>({
  config: defaultConfig,
  loading: true,
  reload: async () => {},
});

export function useStoreConfig() {
  return useContext(StoreConfigContext);
}

export function StoreConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<StoreConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStoreConfig();
      setConfig(data ?? defaultConfig);
    } catch {
      setConfig(defaultConfig);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = config.theme;
    if (!t) return;
    const root = document.documentElement;
    if (t.primary) root.style.setProperty("--primary", t.primary);
    if (t.primaryHover) root.style.setProperty("--primary-hover", t.primaryHover);
    if (t.surface) root.style.setProperty("--surface", t.surface);
    if (t.border) root.style.setProperty("--border", t.border);
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-hover");
      root.style.removeProperty("--surface");
      root.style.removeProperty("--border");
    };
  }, [config.theme]);

  const value = { config, loading, reload: load };

  return (
    <StoreConfigContext.Provider value={value}>
      {children}
    </StoreConfigContext.Provider>
  );
}
