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
import type { Cart } from "@/lib/api";
import { getCart, mergeGuestCartIntoTelegram } from "@/lib/api";
import {
  clearGuestCartSessionId,
  getCartSessionId,
  peekGuestCartSessionId,
} from "@/lib/cart-session";
import { useTelegramWebApp } from "@/context/TelegramWebAppContext";

const emptyCart: Cart = { id: null, uahPerUsd: 41, items: [], subtotal: 0 };

type CartContextValue = {
  cart: Cart;
  loading: boolean;
  error: string | null;
  count: number;
  sumUah: number;
  refresh: () => Promise<Cart>;
  applyCart: (cart: Cart) => void;
};

const CartContext = createContext<CartContextValue>({
  cart: emptyCart,
  loading: true,
  error: null,
  count: 0,
  sumUah: 0,
  refresh: async () => emptyCart,
  applyCart: () => {},
});

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const telegram = useTelegramWebApp();
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasCartRef = useRef(false);
  const fetchGenRef = useRef(0);
  const mergedGuestRef = useRef<string>("");

  const applyCart = useCallback((next: Cart) => {
    setCart(next);
    hasCartRef.current = true;
    setError(null);
  }, []);

  const refresh = useCallback(async (opts?: { soft?: boolean }) => {
    const gen = ++fetchGenRef.current;
    const soft = Boolean(opts?.soft && hasCartRef.current);
    if (!soft) setLoading(true);
    try {
      const next = await getCart(getCartSessionId());
      if (gen !== fetchGenRef.current) return next;
      setCart(next);
      hasCartRef.current = true;
      setError(null);
      return next;
    } catch (e) {
      if (gen !== fetchGenRef.current) return emptyCart;
      const message = e instanceof Error ? e.message : "Помилка завантаження кошика";
      setError(message);
      if (!soft) {
        setCart(emptyCart);
        hasCartRef.current = false;
      }
      throw e;
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Paint the cart immediately. Telegram initData can arrive later and must not hold the skeleton.
    let cancelled = false;
    const run = async () => {
      const tgCartId = telegram.cartSessionId.trim();
      const guestId = peekGuestCartSessionId();
      if (
        telegram.isTelegram &&
        telegram.token &&
        tgCartId &&
        guestId &&
        guestId !== tgCartId &&
        mergedGuestRef.current !== `${guestId}->${tgCartId}`
      ) {
        try {
          const merged = await mergeGuestCartIntoTelegram(guestId);
          if (cancelled) return;
          mergedGuestRef.current = `${guestId}->${tgCartId}`;
          clearGuestCartSessionId();
          setCart(merged);
          hasCartRef.current = true;
          setError(null);
          setLoading(false);
          return;
        } catch {
          /* fall through to a normal fetch */
        }
      }
      if (cancelled) return;
      await refresh({ soft: hasCartRef.current }).catch(() => undefined);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [refresh, telegram.isTelegram, telegram.cartSessionId, telegram.token]);

  const { count, sumUah } = useMemo(
    () => ({
      count: cart.items.length,
      sumUah: Math.round(cart.subtotal * (cart.uahPerUsd || 41)),
    }),
    [cart],
  );

  const value = useMemo(
    () => ({
      cart,
      loading,
      error,
      count,
      sumUah,
      refresh: () => refresh({ soft: false }),
      applyCart,
    }),
    [cart, loading, error, count, sumUah, refresh, applyCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
