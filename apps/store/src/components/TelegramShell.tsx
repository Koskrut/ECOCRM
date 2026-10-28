"use client";

import { useEffect } from "react";
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
      if (pathname === "/cart") router.push("/checkout");
      else if (pathname === "/checkout") return;
      else router.push("/cart");
    };

    main.onClick(onCart);
    if (pathname === "/checkout") {
      main.hide();
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
  }, [telegram.isTelegram, telegram.ready, count, sumUah, pathname, router]);

  return (
    <>
      {telegram.isTelegram && telegram.error ? (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {telegram.error}
        </div>
      ) : null}
      {children}
    </>
  );
}
