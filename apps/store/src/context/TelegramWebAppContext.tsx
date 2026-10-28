"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  close: () => {},
});

export function useTelegramWebApp() {
  return useContext(TelegramWebAppContext);
}

async function exchangeInitData(initData: string) {
  const res = await fetch("/api/store/telegram/webapp-session", {
    method: "POST",
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
        setTelegramStoreSession(session);
        setToken(session.token);
        setCartSessionId(session.cartSessionId);
        setProfile({
          phone: session.phone,
          firstName: session.firstName,
          lastName: session.lastName,
          contactId: session.contactId,
        });
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Не вдалося увійти через Telegram");
        // Keep any prior valid session from this tab if re-open failed mid-browse.
        setToken(getTelegramStoreToken());
        setCartSessionId(getTelegramCartSessionId());
        setProfile(getTelegramStoreProfile());
      })
      .finally(() => {
        setLoading(false);
        setReady(true);
      });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      isTelegram,
      loading,
      error,
      token,
      cartSessionId,
      profile,
      close,
    }),
    [ready, isTelegram, loading, error, token, cartSessionId, profile, close],
  );

  return (
    <TelegramWebAppContext.Provider value={value}>{children}</TelegramWebAppContext.Provider>
  );
}
