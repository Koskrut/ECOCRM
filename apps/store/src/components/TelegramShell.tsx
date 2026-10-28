"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useTelegramWebApp } from "@/context/TelegramWebAppContext";
import { getTelegramWebApp } from "@/lib/telegram-webapp";

/**
 * Mini App chrome: hide marketing chrome, wire Telegram MainButton to cart/checkout.
 * Children stay mounted; CSS hides site chrome when data-tg-miniapp is set.
 */
export function TelegramShell({ children }: { children: React.ReactNode }) {
  const telegram = useTelegramWebApp();
  const { count, sumUah } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!telegram.isTelegram) {
      document.documentElement.removeAttribute("data-tg-miniapp");
      return;
    }
    document.documentElement.setAttribute("data-tg-miniapp", "1");
    return () => document.documentElement.removeAttribute("data-tg-miniapp");
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
      if (pathname === "/cart") router.push("/checkout");
      else if (pathname === "/checkout") return;
      else router.push("/cart");
    };

    main.onClick(onCart);
    if (pathname === "/checkout" || pathname.startsWith("/thank-you")) {
      main.hide();
    } else if (!telegram.loggedIn) {
      main.setText("Оновити профіль");
      main.show();
    } else if (count > 0) {
      main.setText(
        pathname === "/cart" ? "Оформити" : `Кошик · ${sumUah} грн`,
      );
      main.show();
    } else {
      main.hide();
    }

    return () => {
      main.offClick(onCart);
      main.hide();
    };
  }, [
    telegram.isTelegram,
    telegram.ready,
    telegram.loggedIn,
    telegram.refreshSession,
    count,
    sumUah,
    pathname,
    router,
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
