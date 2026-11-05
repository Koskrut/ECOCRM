/** Mini App document (set by TelegramShell). */
export function isTelegramMiniAppDocument(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-tg-miniapp") === "1";
}

/** Full load — Telegram Android crashes on Next.js history.pushState / replaceState. */
export function assignStorePath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    window.location.assign(path);
  } catch {
    window.location.href = path;
  }
}

export function navigateStorePath(path: string, spaNavigate: (path: string) => void): void {
  if (isTelegramMiniAppDocument()) assignStorePath(path);
  else spaNavigate(path);
}

export function isTelegramInternalHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) {
    return false;
  }
  if (value.startsWith("/")) return true;
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}
