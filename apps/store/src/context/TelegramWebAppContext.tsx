"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getTelegramWebApp } from "@/lib/telegram-webapp";
import {
  clearTelegramStoreSession,
  getTelegramCartSessionId,
  getTelegramStoreProfile,
  getTelegramStoreToken,
  setTelegramStoreSession,
  type TelegramStoreProfile,
} from "@/lib/telegram-session";

type TelegramWebAppContextValue = {
  ready: boolean;
  isTelegram: boolean;
  loading: boolean;
  error: string | null;
  token: string;
  cartSessionId: string;
  profile: TelegramStoreProfile | null;
  loggedIn: boolean;
  /** Re-exchange initData (e.g. after bot onboarding). */
  refreshSession: () => Promise<boolean>;
  close: () => void;
};

const TelegramWebAppContext = createContext<TelegramWebAppContextValue>({
  ready: false,
  isTelegram: false,
  loading: false,
  error: null,
  token: "",
  cartSessionId: "",
  profile: null,
  loggedIn: false,
  refreshSession: async () => false,
  close: () => {},
});

export function useTelegramWebApp() {
  return useContext(TelegramWebAppContext);
}

async function exchangeInitData(initData: string) {
  const res = await fetch("/api/auth/store-telegram-session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? "Telegram session failed");
  }
  return res.json() as Promise<{
    token: string;
    cartSessionId: string;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    contactId: string | null;
    customerId: string | null;
    loggedIn: boolean;
  }>;
}

export function TelegramWebAppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [cartSessionId, setCartSessionId] = useState("");
  const [profile, setProfile] = useState<TelegramStoreProfile | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const loggedInRef = useRef(false);

  const applySession = useCallback(
    (session: Awaited<ReturnType<typeof exchangeInitData>>) => {
      setTelegramStoreSession(session);
      setToken(session.token);
      setCartSessionId(session.cartSessionId);
      setProfile({
        phone: session.phone,
        firstName: session.firstName,
        lastName: session.lastName,
        contactId: session.contactId,
      });
      const nextLoggedIn = Boolean(session.loggedIn);
      loggedInRef.current = nextLoggedIn;
      setLoggedIn(nextLoggedIn);
      setError(null);
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    const app = getTelegramWebApp();
    const initData = app?.initData?.trim();
    if (!initData) return false;
    try {
      const session = await exchangeInitData(initData);
      applySession(session);
      return Boolean(session.loggedIn);
    } catch {
      return false;
    }
  }, [applySession]);

  const close = useCallback(() => {
    getTelegramWebApp()?.close();
  }, []);

  useEffect(() => {
    const app = getTelegramWebApp();
    if (!app) {
      clearTelegramStoreSession();
      setReady(true);
      return;
    }

    setIsTelegram(true);
    setLoading(true);
    try {
      app.ready();
      app.expand();
    } catch {
      /* ignore */
    }

    const theme = app.themeParams ?? {};
    if (theme.bg_color) {
      document.documentElement.style.setProperty("--tg-bg", theme.bg_color);
    }
    if (theme.button_color) {
      document.documentElement.style.setProperty("--primary", theme.button_color);
    }

    void exchangeInitData(app.initData)
      .then((session) => {
        applySession(session);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Не вдалося увійти через Telegram");
        setToken(getTelegramStoreToken());
        setCartSessionId(getTelegramCartSessionId());
        setProfile(getTelegramStoreProfile());
        loggedInRef.current = false;
        setLoggedIn(false);
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, [applySession]);

  // After bot onboarding, Telegram may reopen/focus the Mini App — refresh CRM login.
  useEffect(() => {
    if (!isTelegram || !ready) return;

    const refreshIfNeeded = () => {
      if (loggedInRef.current) return;
      if (document.visibilityState && document.visibilityState !== "visible") return;
      void refreshSession();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfNeeded();
    };

    window.addEventListener("focus", refreshIfNeeded);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(refreshIfNeeded, 15_000);

    return () => {
      window.removeEventListener("focus", refreshIfNeeded);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [isTelegram, ready, refreshSession]);

  const value = useMemo(
    () => ({
      ready,
      isTelegram,
      loading,
      error,
      token,
      cartSessionId,
      profile,
      loggedIn,
      refreshSession,
      close,
    }),
    [
      ready,
      isTelegram,
      loading,
      error,
      token,
      cartSessionId,
      profile,
      loggedIn,
      refreshSession,
      close,
    ],
  );

  return (
    <TelegramWebAppContext.Provider value={value}>{children}</TelegramWebAppContext.Provider>
  );
}
