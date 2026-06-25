import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { systemApi, NOVA_POSHTA_MODULE_ID, VISITS_MODULE_ID } from "@/lib/api/system";
import { useAuth } from "@/context/auth-context";

type ModulesCtx = {
  ready: boolean;
  visitsEnabled: boolean;
  npEnabled: boolean;
  refresh: () => Promise<void>;
};

const ModulesContext = createContext<ModulesCtx>({
  ready: false,
  visitsEnabled: true,
  npEnabled: true,
  refresh: async () => {},
});

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const { token, ready: authReady } = useAuth();
  const [ready, setReady] = useState(false);
  const [visitsEnabled, setVisitsEnabled] = useState(true);
  const [npEnabled, setNpEnabled] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) {
      setVisitsEnabled(true);
      setNpEnabled(true);
      setReady(true);
      return;
    }
    try {
      const res = await systemApi.listModules(token);
      setVisitsEnabled(systemApi.isModuleEffective(res.modules, VISITS_MODULE_ID));
      setNpEnabled(systemApi.isModuleEffective(res.modules, NOVA_POSHTA_MODULE_ID));
    } catch {
      setVisitsEnabled(true);
      setNpEnabled(true);
    } finally {
      setReady(true);
    }
  }, [token]);

  useEffect(() => {
    if (!authReady) return;
    void refresh();
  }, [authReady, refresh]);

  const value = useMemo(
    () => ({ ready, visitsEnabled, npEnabled, refresh }),
    [ready, visitsEnabled, npEnabled, refresh],
  );

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesCtx {
  return useContext(ModulesContext);
}
