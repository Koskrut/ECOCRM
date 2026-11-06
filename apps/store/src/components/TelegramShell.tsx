"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useTelegramWebApp } from "@/context/TelegramWebAppContext";
import { getTelegramWebApp } from "@/lib/telegram-webapp";
import {
  assignStorePath,
  isTelegramInternalHref,
  peekTelegramNavStack,
  popTelegramNavPath,
} from "@/lib/telegram-nav";

function safeTelegramCall(run: () => void) {
  try {
    run();
  } catch {
    /* Android Telegram chrome APIs throw and kill the Mini App. */
  }
}

/**
 * Mini App chrome: hide marketing chrome, in-page cart bar, Telegram BackButton.
 * Native MainButton is skipped — it crashes a subset of Android clients.
 */
export function TelegramShell({ children }: { children: React.ReactNode }) {
  const telegram = useTelegramWebApp();
  const { count, sumUah } = useCart();
  const pathname = usePathname();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (telegram.isTelegram) {
      document.documentElement.setAttribute("data-tg-miniapp", "1");
      return;
    }
    // Head script already flags a Telegram launch. Do not strip it before boot finishes —
    // that window lets Next.js history.pushState crash Android (Oops + duck).
    if (!telegram.ready) return;
    document.documentElement.removeAttribute("data-tg-miniapp");
    document.documentElement.removeAttribute("data-tg-bar");
  }, [telegram.isTelegram, telegram.ready]);

  // Next.js client navigation uses history.pushState; Android Telegram shows Oops+duck.
  useEffect(() => {
    const intercept =
      telegram.isTelegram || document.documentElement.getAttribute("data-tg-miniapp") === "1";
    if (!intercept) return;
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
      event.stopImmediatePropagation();
      assignStorePath(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [telegram.isTelegram, telegram.ready]);

  useEffect(() => {
    if (!telegram.isTelegram || !telegram.ready) return;
    const app = getTelegramWebApp();
    const back = app?.BackButton;
    if (!back) return;

    const onBack = () => {
      const prev = popTelegramNavPath();
      if (prev) assignStorePath(prev, { back: true });
      else safeTelegramCall(() => app?.close?.());
    };

    safeTelegramCall(() => back.onClick(onBack));
    if (peekTelegramNavStack().length > 0) safeTelegramCall(() => back.show());
    else safeTelegramCall(() => back.hide());

    return () => {
      safeTelegramCall(() => {
        back.offClick(onBack);
        back.hide();
      });
    };
  }, [telegram.isTelegram, telegram.ready, pathname]);

  const hideBar = pathname === "/checkout" || pathname.startsWith("/thank-you");
  let barLabel = "";
  let barAction: (() => void) | null = null;
  if (telegram.isTelegram && telegram.ready && !hideBar) {
    if (!telegram.loggedIn && !telegram.loading) {
      barLabel = telegram.error ? "Оновити сесію" : "Оновити профіль";
      barAction = () => {
        void telegram.refreshSession();
      };
    } else if (telegram.loggedIn && count > 0) {
      barLabel = pathname === "/cart" ? "Оформити" : `Кошик · ${sumUah} грн`;
      barAction = () => assignStorePath(pathname === "/cart" ? "/checkout" : "/cart");
    }
  }

  useEffect(() => {
    if (barLabel) document.documentElement.setAttribute("data-tg-bar", "1");
    else document.documentElement.removeAttribute("data-tg-bar");
  }, [barLabel]);

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
      {barLabel && barAction ? (
        <div className="tg-miniapp-bar">
          <button type="button" onClick={barAction}>
            {barLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
