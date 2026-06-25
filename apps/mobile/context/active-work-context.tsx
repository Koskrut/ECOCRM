import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ActiveWorkState = {
  activeVisitId: string | null;
  activeVisitLabel: string | null;
  callSessionId: string | null;
  callSessionLabel: string | null;
  orderDraftLabel: string | null;
};

type ActiveWorkCtx = ActiveWorkState & {
  setActiveVisit: (id: string | null, label?: string | null) => void;
  setCallSession: (id: string | null, label?: string | null) => void;
  setOrderDraft: (label: string | null) => void;
  clearAll: () => void;
};

const defaultState: ActiveWorkState = {
  activeVisitId: null,
  activeVisitLabel: null,
  callSessionId: null,
  callSessionLabel: null,
  orderDraftLabel: null,
};

const ActiveWorkContext = createContext<ActiveWorkCtx>({
  ...defaultState,
  setActiveVisit: () => {},
  setCallSession: () => {},
  setOrderDraft: () => {},
  clearAll: () => {},
});

export function ActiveWorkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ActiveWorkState>(defaultState);

  const setActiveVisit = useCallback((id: string | null, label?: string | null) => {
    setState((s) => ({
      ...s,
      activeVisitId: id,
      activeVisitLabel: label ?? s.activeVisitLabel,
    }));
  }, []);

  const setCallSession = useCallback((id: string | null, label?: string | null) => {
    setState((s) => ({
      ...s,
      callSessionId: id,
      callSessionLabel: label ?? s.callSessionLabel,
    }));
  }, []);

  const setOrderDraft = useCallback((label: string | null) => {
    setState((s) => ({ ...s, orderDraftLabel: label }));
  }, []);

  const clearAll = useCallback(() => setState(defaultState), []);

  const value = useMemo(
    () => ({ ...state, setActiveVisit, setCallSession, setOrderDraft, clearAll }),
    [state, setActiveVisit, setCallSession, setOrderDraft, clearAll],
  );

  return <ActiveWorkContext.Provider value={value}>{children}</ActiveWorkContext.Provider>;
}

export function useActiveWork(): ActiveWorkCtx {
  return useContext(ActiveWorkContext);
}
