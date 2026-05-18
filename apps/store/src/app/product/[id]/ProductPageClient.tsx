"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addToCart } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/Button";

type Props = {
  productId: string;
  inStock: boolean;
};

export function ProductPageClient({ productId, inStock }: Props) {
  const router = useRouter();
  const { applyCart } = useCart();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddToCart = async () => {
    if (!inStock || adding) return;
    setAdding(true);
    setError(null);
    try {
      const sessionId = getCartSessionId();
      const next = await addToCart(productId, 1, sessionId);
      applyCart(next);
      router.push("/cart");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося додати в кошик");
      setAdding(false);
    }
  };

  if (!inStock) {
    return (
      <p className="min-h-[48px] flex flex-1 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-zinc-600 sm:min-h-[44px]">
        Немає в наявності
      </p>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <Button
        type="button"
        disabled={adding}
        onClick={handleAddToCart}
        className="min-h-[48px] flex-1 sm:min-h-[44px]"
      >
        {adding ? "Додавання…" : "В кошик"}
      </Button>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
