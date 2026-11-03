export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramWebAppUser };
  ready: () => void;
  expand: () => void;
  close: () => void;
  themeParams?: Record<string, string>;
  platform?: string;
  MainButton?: {
    text: string;
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** True when Telegram injected the WebApp bridge (initData may still be empty briefly). */
export function hasTelegramWebAppBridge(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Telegram?.WebApp);
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function getTelegramInitData(): string {
  const app = getTelegramWebApp();
  return app?.initData?.trim() ?? "";
}

/** Script loads outside Telegram too — only initData (or unsafe user) means a real Mini App. */
export function isRealTelegramMiniApp(app: TelegramWebApp | null | undefined): boolean {
  if (!app) return false;
  if (app.initData?.trim()) return true;
  return Boolean(app.initDataUnsafe?.user?.id);
}

/**
 * Wait until telegram-web-app.js is present and initData is filled.
 * Catalog web_app opens can race React hydration vs the Telegram bridge.
 * Returns null for a normal browser tab (script stub without initData).
 */
export async function waitForTelegramWebApp(opts?: {
  timeoutMs?: number;
}): Promise<TelegramWebApp | null> {
  if (typeof window === "undefined") return null;
  const timeoutMs = opts?.timeoutMs ?? 4_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const app = window.Telegram?.WebApp;
    if (app) {
      try {
        app.ready?.();
      } catch {
        /* ignore */
      }
      if (isRealTelegramMiniApp(app)) return app;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  const app = window.Telegram?.WebApp ?? null;
  return isRealTelegramMiniApp(app) ? app : null;
}

export function isTelegramMiniApp(): boolean {
  return isRealTelegramMiniApp(getTelegramWebApp());
}
