"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Cart } from "@/lib/api";
import { getCart } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";

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
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyCart = useCallback((next: Cart) => {
    setCart(next);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getCart(getCartSessionId());
      setCart(next);
      setError(null);
      return next;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Помилка завантаження кошика";
      setError(message);
      setCart(emptyCart);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { count, sumUah } = useMemo(
    () => ({
      count: cart.items.length,
      sumUah: Math.round(cart.subtotal * (cart.uahPerUsd || 41)),
    }),
    [cart],
  );

  const value = useMemo(
    () => ({ cart, loading, error, count, sumUah, refresh, applyCart }),
    [cart, loading, error, count, sumUah, refresh, applyCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
