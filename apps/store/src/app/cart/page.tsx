"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Cart } from "@/lib/api";
import { getCart, removeCartItem, updateCartItem } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";
import { ButtonLink } from "@/components/Button";

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const sessionId = getCartSessionId();
    getCart(sessionId)
      .then(setCart)
      .catch(() => setCart({ id: null, uahPerUsd: 41, items: [], subtotal: 0 }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const updateQty = async (itemId: string, qty: number) => {
    try {
      const next = await updateCartItem(itemId, qty);
      setCart(next);
    } catch {
      load();
    }
  };

  const remove = async (itemId: string) => {
    try {
      const next = await removeCartItem(itemId);
      setCart(next);
    } catch {
      load();
    }
  };

  const uah = cart?.uahPerUsd ?? 41;
  const subtotalUah = cart ? Math.round(cart.subtotal * uah) : 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
          Кошик
        </h1>
        {cart?.items.length ? (
          <>
            <ul className="mt-6 space-y-4">
              {cart.items.map((i) => {
                const priceUah = Math.round(i.price * uah);
                const lineUah = Math.round(i.lineTotal * uah);
                return (
                  <li
                    key={i.id}
                    className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-zinc-900">{i.name}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {priceUah} грн × {i.qty} = {lineUah} грн
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-1">
                      <button
                        type="button"
                        onClick={() => updateQty(i.id, Math.max(0, i.qty - 1))}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-zinc-600 hover:bg-[var(--surface)] transition"
                        aria-label="Зменшити кількість"
                      >
                        −
                      </button>
                      <span className="min-w-[2.5rem] text-center text-base font-medium">{i.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(i.id, i.qty + 1)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-zinc-600 hover:bg-[var(--surface)] transition"
                        aria-label="Збільшити кількість"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(i.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition ml-auto sm:ml-2"
                        aria-label="Видалити"
                        title="Видалити"
                      >
                        <span className="sr-only">Видалити</span>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8 flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="text-lg font-semibold text-zinc-900">
                Разом: {subtotalUah} грн
              </p>
              <ButtonLink href="/checkout" className="min-h-[48px] flex items-center justify-center sm:min-h-[44px]">
                Оформити замовлення
              </ButtonLink>
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-white p-8 text-center sm:p-12">
            <p className="text-zinc-600">Кошик порожній.</p>
            <ButtonLink href="/" className="mt-4 min-h-[48px] inline-flex items-center justify-center sm:min-h-[44px]">
              В каталог
            </ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}
