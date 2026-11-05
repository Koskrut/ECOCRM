"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useTelegramWebApp } from "@/context/TelegramWebAppContext";
import { getTelegramWebApp } from "@/lib/telegram-webapp";
import { assignStorePath, isTelegramInternalHref } from "@/lib/telegram-nav";

function safeMainButtonCall(run: () => void) {
  try {
    run();
  } catch {
    /* Android Telegram MainButton throws and kills the Mini App. */
  }
}

/**
 * Mini App chrome: hide marketing chrome, wire Telegram MainButton to cart/checkout.
 * Children stay mounted; CSS hides site chrome when data-tg-miniapp is set.
 */
export function TelegramShell({ children }: { children: React.ReactNode }) {
  const telegram = useTelegramWebApp();
  const { count, sumUah } = useCart();
  const pathname = usePathname();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!telegram.isTelegram) {
      document.documentElement.removeAttribute("data-tg-miniapp");
      return;
    }
    document.documentElement.setAttribute("data-tg-miniapp", "1");
    return () => document.documentElement.removeAttribute("data-tg-miniapp");
  }, [telegram.isTelegram]);

  // Next.js client navigation uses history.pushState; Android Telegram shows Oops+duck.
  useEffect(() => {
    if (!telegram.isTelegram) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || !isTelegramInternalHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      assignStorePath(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [telegram.isTelegram]);

  useEffect(() => {
    if (!telegram.isTelegram || !telegram.ready) return;
    const app = getTelegramWebApp();
    const main = app?.MainButton;
    if (!main) return;

    const onCart = () => {
      if (!telegram.loggedIn) {
        void telegram.refreshSession();
        return;
      }
      if (pathname === "/checkout") return;
      assignStorePath(pathname === "/cart" ? "/checkout" : "/cart");
    };

    safeMainButtonCall(() => main.onClick(onCart));
    if (pathname === "/checkout" || pathname.startsWith("/thank-you")) {
      safeMainButtonCall(() => main.hide());
    } else if (!telegram.loggedIn && !telegram.loading) {
      safeMainButtonCall(() => {
        main.setText(telegram.error ? "Оновити сесію" : "Оновити профіль");
        main.show();
      });
    } else if (count > 0) {
      safeMainButtonCall(() => {
        main.setText(pathname === "/cart" ? "Оформити" : `Кошик · ${sumUah} грн`);
        main.show();
      });
    } else {
      safeMainButtonCall(() => main.hide());
    }

    return () => {
      safeMainButtonCall(() => {
        main.offClick(onCart);
        main.hide();
      });
    };
  }, [
    telegram.isTelegram,
    telegram.ready,
    telegram.loggedIn,
    telegram.loading,
    telegram.error,
    telegram.refreshSession,
    count,
    sumUah,
    pathname,
  ]);

  const showProfileGate =
    telegram.isTelegram && telegram.ready && !telegram.loading && !telegram.loggedIn && !telegram.error;

  return (
    <>
      {telegram.isTelegram && telegram.error ? (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {telegram.error}
        </div>
      ) : null}
      {showProfileGate ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Завершіть профіль у чаті з ботом</p>
          <p className="mt-1 text-amber-900/90">
            Поділіться телефоном і коротко вкажіть імʼя, роль та область — тоді зʼявиться кабінет і
            оформлення.
          </p>
          <button
            type="button"
            className="mt-2 text-sm font-medium text-amber-950 underline underline-offset-2 disabled:opacity-60"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void telegram.refreshSession().finally(() => setRefreshing(false));
            }}
          >
            {refreshing ? "Перевіряємо…" : "Уже завершив — оновити"}
          </button>
        </div>
      ) : null}
      {children}
    </>
  );
}
