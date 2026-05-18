"use client";

import Link from "next/link";
import { useState } from "react";
import { addToCart } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";
import { useCart } from "@/context/CartContext";

export type ProductCardProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: number;
  inStock: boolean;
  primaryImageUrl?: string | null;
  primaryImageId?: string | null;
};

function priceUah(usd: number, uahPerUsd: number) {
  return Math.round(usd * uahPerUsd);
}

export function ProductCard({
  product,
  uahPerUsd,
}: {
  product: ProductCardProduct;
  uahPerUsd: number;
}) {
  const { applyCart } = useCart();
  const price = priceUah(product.basePrice, uahPerUsd);
  const [qtyPickerOpen, setQtyPickerOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decQty = () => setQty((v) => Math.max(1, v - 1));
  const incQty = () => setQty((v) => Math.min(999, v + 1));

  const handleAddToCart = async () => {
    if (adding || !product.inStock) return;
    setAdding(true);
    setError(null);
    try {
      const sessionId = getCartSessionId();
      const next = await addToCart(product.id, qty, sessionId);
      applyCart(next);
      setQtyPickerOpen(false);
      setAdded(true);
      setTimeout(() => setAdded(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося додати в кошик");
    } finally {
      setAdding(false);
    }
  };

  const openQtyPicker = () => {
    if (!product.inStock) return;
    setAdded(false);
    setError(null);
    setQtyPickerOpen(true);
  };

  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/product/${product.id}`} className="flex flex-1 flex-col">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--surface)]">
          {product.primaryImageId ? (
            <img
              src={`/api/products/images/${product.primaryImageId}/source?v=3`}
              alt=""
              width={400}
              height={300}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-3xl font-light text-zinc-300">
              {product.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h2 className="font-heading font-medium text-zinc-900 line-clamp-2 text-sm leading-snug">
            {product.name}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {product.sku} · {product.unit}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold text-[var(--primary)]">
              {price} грн
            </span>
            <span className="text-xs text-zinc-500 shrink-0">
              {product.inStock ? "В наявності" : "Немає в наявності"}
            </span>
          </div>
        </div>
      </Link>
      <div className="p-3 pt-0">
        {!product.inStock ? (
          <p className="text-center text-xs text-zinc-500">Немає в наявності</p>
        ) : !qtyPickerOpen ? (
          <button
            type="button"
            onClick={openQtyPicker}
            className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--primary-hover)]"
          >
            {added ? "Додано" : "В кошик"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white px-2 py-1">
              <button
                type="button"
                onClick={decQty}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-700 transition hover:bg-[var(--surface)]"
                aria-label="Зменшити кількість"
              >
                -
              </button>
              <span className="min-w-[2ch] text-center text-sm font-medium text-zinc-900">{qty}</span>
              <button
                type="button"
                onClick={incQty}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-700 transition hover:bg-[var(--surface)]"
                aria-label="Збільшити кількість"
              >
                +
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setQtyPickerOpen(false)}
                className="inline-flex min-h-[32px] flex-1 items-center justify-center rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-[var(--surface)]"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={adding}
                onClick={handleAddToCart}
                className="inline-flex min-h-[32px] flex-1 items-center justify-center rounded-lg bg-[var(--primary)] px-2 py-1 text-xs font-medium text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {adding ? "Додаю..." : `Додати ${qty}`}
              </button>
            </div>
            {error ? (
              <p className="text-center text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
        {product.inStock && !qtyPickerOpen && error ? (
          <p className="mt-2 text-center text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
