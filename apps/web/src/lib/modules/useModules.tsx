"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ModuleIds, type ModuleId } from "./module-ids";
import { fetchSystemModules } from "./modules-client";
import type { SystemModuleState } from "./modules.types";

type ModulesStatus = "loading" | "ready" | "error";

type ModulesContextValue = {
  status: ModulesStatus;
  modules: SystemModuleState[] | null;
  effective: (id: ModuleId) => boolean;
};

const ModulesContext = createContext<ModulesContextValue | null>(null);

function failOpenEffective(_: ModuleId): boolean {
  return true;
}

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ModulesStatus>("loading");
  const [modules, setModules] = useState<SystemModuleState[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchSystemModules();
        if (cancelled) return;
        setModules(Array.isArray(r.modules) ? r.modules : []);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        // Phase 1: fail-open on errors (preserve current behavior)
        setModules(null);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ModulesContextValue>(() => {
    const map = new Map<string, boolean>();
    if (modules) {
      for (const m of modules) {
        map.set(String(m.id), m.effective === true);
      }
    }
    map.set(ModuleIds.CoreCrm, true);
    const effective =
      status === "ready" ? (id: ModuleId) => map.get(id) === true : failOpenEffective;

    return { status, modules, effective };
  }, [modules, status]);

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules() {
  const ctx = useContext(ModulesContext);
  if (!ctx) {
    return { status: "error" as const, modules: null, effective: failOpenEffective };
  }
  return ctx;
}
