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

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const app = window.Telegram?.WebApp;
  if (!app || typeof app.initData !== "string" || !app.initData) return null;
  return app;
}

export function isTelegramMiniApp(): boolean {
  return getTelegramWebApp() != null;
}
