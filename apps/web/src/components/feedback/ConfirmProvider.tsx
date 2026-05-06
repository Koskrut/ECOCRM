"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { strings } from "@/locales";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type ConfirmState = {
  open: boolean;
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  destructive: boolean;
};

const DEFAULT_STATE: ConfirmState = {
  open: false,
  title: undefined,
  message: "",
  confirmText: "OK",
  cancelText: strings.common.cancel,
  destructive: false,
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>(DEFAULT_STATE);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const resolve = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolvePromise) => {
      resolverRef.current = resolvePromise;
      setState({
        open: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? "Confirm",
        cancelText: options.cancelText ?? strings.common.cancel,
        destructive: options.destructive ?? false,
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state.open ? (
        <>
          <div
            className="fixed inset-0 z-[110] bg-black/40"
            role="presentation"
            onClick={() => resolve(false)}
          />
          <div className="fixed inset-0 z-[111] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              {state.title ? (
                <h2 className="text-base font-semibold text-zinc-900">{state.title}</h2>
              ) : null}
              <p className={`text-sm text-zinc-700 ${state.title ? "mt-2" : ""}`}>
                {state.message}
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => resolve(false)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {state.cancelText}
                </button>
                <button
                  type="button"
                  onClick={() => resolve(true)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
                    state.destructive
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-zinc-900 hover:bg-zinc-800"
                  }`}
                >
                  {state.confirmText}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return {
      confirm: async (_options: ConfirmOptions) => false,
    };
  }
  return ctx;
}
